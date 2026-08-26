import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { ChatEventsService } from '../../common/services/chat-events/chat-events.service';
import { generateHash } from '../../common/utils/generate-hash.util';
import {
  call_participant_status,
  call_status,
  call_type,
} from '../../../generated/prisma/enums';
import { ConversationsService } from '../conversations/conversations.service';
import {
  CallListResponseDto,
  CallResponseDto,
  ListCallsQueryDto,
} from './calls.model';

const callInclude = { participants: true } as const;
const liveParticipationWhere = (userId: string) => ({
  user_id: userId,
  status: {
    in: [
      call_participant_status.invited,
      call_participant_status.ringing,
      call_participant_status.joined,
    ],
  },
  call: { status: { in: [call_status.ringing, call_status.active] } },
});

@Injectable()
export class CallsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async listCalls(
    currentUserId: string,
    conversationHash: string,
    query: ListCallsQueryDto,
  ): Promise<CallListResponseDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );

    const limit = query.limit ?? 20;

    const found = await this.prismaService.calls.findMany({
      where: {
        conversation_id: conversation.id,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: callInclude,
      orderBy: { id: 'desc' },
      take: limit,
    });

    const next_cursor =
      found.length === limit ? found[found.length - 1].id : null;

    const data = found.map((call) => new CallResponseDto(call));

    return new CallListResponseDto({ data, next_cursor });
  }

  async initiateCall(
    currentUserId: string,
    conversationHash: string,
    type: call_type,
  ): Promise<CallResponseDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );

    const inviteeIds = conversation.members
      .filter((member) => !member.left_at && member.user_id !== currentUserId)
      .map((member) => member.user_id);

    if (inviteeIds.length === 0)
      throw new BadRequestException(
        'There is no one else in this conversation to call!||គ្មាននរណាម្នាក់ផ្សេងទៀតនៅក្នុងការសន្ទនានេះដើម្បីហៅទេ!',
      );

    const existingCall = await this.prismaService.calls.findFirst({
      where: {
        conversation_id: conversation.id,
        status: { in: [call_status.ringing, call_status.active] },
      },
    });

    if (existingCall)
      throw new BadRequestException(
        'There is already an active call in this conversation!||មានការហៅមួយកំពុងដំណើរការរួចហើយក្នុងការសន្ទនានេះ!',
      );

    const call = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.calls.create({
        data: {
          hash: generateHash(),
          conversation_id: conversation.id,
          caller_id: currentUserId,
          type,
          status: call_status.ringing,
          started_at: new Date(),
        },
      });

      await tx.call_participants.createMany({
        data: [
          {
            call_id: created.id,
            user_id: currentUserId,
            status: call_participant_status.joined,
          },
          ...inviteeIds.map((user_id) => ({
            call_id: created.id,
            user_id,
            status: call_participant_status.invited,
          })),
        ],
      });

      return tx.calls.findUniqueOrThrow({
        where: { id: created.id },
        include: callInclude,
      });
    });

    const response = new CallResponseDto(call);
    this.broadcast(call, 'call:invite', response);
    return response;
  }

  async ring(
    currentUserId: string,
    callHash: string,
  ): Promise<CallResponseDto> {
    const call = await this.getCallForParticipant(currentUserId, callHash);
    const participant = this.findParticipant(call, currentUserId);

    if (participant.status === call_participant_status.invited) {
      await this.prismaService.call_participants.update({
        where: { id: participant.id },
        data: { status: call_participant_status.ringing },
      });
    }

    const updated = await this.reload(call.id);
    this.broadcast(updated, 'call:ring', {
      call_hash: callHash,
      user_id: currentUserId,
    });
    return new CallResponseDto(updated);
  }

  async answer(
    currentUserId: string,
    callHash: string,
    signal: unknown,
  ): Promise<CallResponseDto> {
    const call = await this.getCallForParticipant(currentUserId, callHash);

    if (
      call.status === call_status.ended ||
      call.status === call_status.cancelled
    )
      throw new BadRequestException(
        'This call has already ended!||ការហៅនេះបានបញ្ចប់រួចហើយ!',
      );

    const participant = this.findParticipant(call, currentUserId);

    await this.prismaService.$transaction([
      this.prismaService.call_participants.update({
        where: { id: participant.id },
        data: { status: call_participant_status.joined, joined_at: new Date() },
      }),
      ...(call.status === call_status.ringing
        ? [
            this.prismaService.calls.update({
              where: { id: call.id },
              data: { status: call_status.active, answered_at: new Date() },
            }),
          ]
        : []),
    ]);

    const updated = await this.reload(call.id);
    this.broadcast(updated, 'call:answer', {
      call_hash: callHash,
      user_id: currentUserId,
      signal,
    });
    return new CallResponseDto(updated);
  }

  async reject(
    currentUserId: string,
    callHash: string,
  ): Promise<CallResponseDto> {
    const call = await this.getCallForParticipant(currentUserId, callHash);

    if (currentUserId === call.caller_id)
      throw new BadRequestException(
        "The caller can't reject their own call — use call:end to cancel it!||អ្នកហៅមិនអាចបដិសេធការហៅរបស់ខ្លួនឯងបានទេ សូមប្រើ call:end ដើម្បីលុបចោល!",
      );

    const participant = this.findParticipant(call, currentUserId);

    await this.prismaService.call_participants.update({
      where: { id: participant.id },
      data: { status: call_participant_status.rejected },
    });

    let updated = await this.reload(call.id);

    // If the call was never answered and nobody besides the caller is still
    // invited/ringing, it never really connected — close it out as rejected.
    const stillPending = updated.participants.some(
      (p) =>
        p.user_id !== updated.caller_id &&
        (p.status === call_participant_status.invited ||
          p.status === call_participant_status.ringing),
    );
    const anyoneElseJoined = updated.participants.some(
      (p) =>
        p.user_id !== updated.caller_id &&
        p.status === call_participant_status.joined,
    );

    if (
      !stillPending &&
      !anyoneElseJoined &&
      updated.status === call_status.ringing
    ) {
      await this.prismaService.calls.update({
        where: { id: updated.id },
        data: { status: call_status.rejected, ended_at: new Date() },
      });
      updated = await this.reload(call.id);
    }

    this.broadcast(updated, 'call:reject', {
      call_hash: callHash,
      user_id: currentUserId,
      status: updated.status,
    });

    return new CallResponseDto(updated);
  }

  async relayIceCandidate(
    currentUserId: string,
    callHash: string,
    targetUserId: string,
    signal: unknown,
  ): Promise<void> {
    const call = await this.getCallForParticipant(currentUserId, callHash);
    // Must also be a call participant, so a candidate can't be relayed to someone outside the call.
    this.findParticipant(call, targetUserId);

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUser(targetUserId, 'call:ice-candidate', {
        call_hash: callHash,
        user_id: currentUserId,
        signal,
      }),
    );
  }

  async endCall(
    currentUserId: string,
    callHash: string,
  ): Promise<CallResponseDto> {
    const call = await this.getCallForParticipant(currentUserId, callHash);
    const participant = this.findParticipant(call, currentUserId);

    if (participant.status === call_participant_status.left)
      return new CallResponseDto(call); // already left — idempotent

    const wasNeverAnswered = call.status === call_status.ringing;

    await this.prismaService.call_participants.update({
      where: { id: participant.id },
      data: { status: call_participant_status.left, left_at: new Date() },
    });

    let updated = await this.reload(call.id);

    const anyoneStillJoined = updated.participants.some(
      (p) => p.status === call_participant_status.joined,
    );

    if (!anyoneStillJoined) {
      await this.prismaService.$transaction([
        this.prismaService.calls.update({
          where: { id: updated.id },
          data: {
            status: wasNeverAnswered
              ? call_status.cancelled
              : call_status.ended,
            ended_at: new Date(),
          },
        }),
        // Anyone still invited/ringing when the call ends never actually answered.
        this.prismaService.call_participants.updateMany({
          where: {
            call_id: updated.id,
            status: {
              in: [
                call_participant_status.invited,
                call_participant_status.ringing,
              ],
            },
          },
          data: { status: call_participant_status.missed },
        }),
      ]);
      updated = await this.reload(call.id);
    }

    this.broadcast(updated, 'call:end', {
      call_hash: callHash,
      user_id: currentUserId,
      status: updated.status,
      ended_at: updated.ended_at,
    });

    return new CallResponseDto(updated);
  }

  async endStaleCallsForUser(userId: string): Promise<void> {
    const staleParticipations = await this.prismaService.call_participants.findMany({
      where: liveParticipationWhere(userId),
      include: { call: true },
    });

    for (const participation of staleParticipations) {
      if (!participation.call.hash) continue; // shouldn't happen — always set on creation
      await this.endCall(userId, participation.call.hash);
    }
  }

  async listActiveCalls(currentUserId: string): Promise<CallListResponseDto> {
    const participations = await this.prismaService.call_participants.findMany({
      where: liveParticipationWhere(currentUserId),
      include: { call: { include: callInclude } },
      orderBy: { call_id: 'desc' },
    });

    const data = participations.map((p) => new CallResponseDto(p.call));
    return new CallListResponseDto({ data, next_cursor: null });
  }

  private async getCallForParticipant(userId: string, callHash: string) {
    const call = await this.prismaService.calls.findUnique({
      where: { hash: callHash },
      include: callInclude,
    });

    if (!call) throw new NotFoundException('Call not found!||រកមិនឃើញការហៅ!');

    this.findParticipant(call, userId);

    return call;
  }

  private findParticipant(
    call: {
      participants: {
        id: number;
        user_id: string;
        status: call_participant_status | null;
      }[];
    },
    userId: string,
  ) {
    const participant = call.participants.find((p) => p.user_id === userId);
    if (!participant)
      throw new ForbiddenException(
        'You are not a participant in this call!||អ្នកមិនមែនជាអ្នកចូលរួមក្នុងការហៅនេះទេ!',
      );
    return participant;
  }

  private async reload(callId: number) {
    return this.prismaService.calls.findUniqueOrThrow({
      where: { id: callId },
      include: callInclude,
    });
  }

  private broadcast(
    call: { participants: { user_id: string }[] },
    event: string,
    payload: unknown,
  ): void {
    const participantIds = call.participants.map((p) => p.user_id);
    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUsers(participantIds, event, payload),
    );
  }
}

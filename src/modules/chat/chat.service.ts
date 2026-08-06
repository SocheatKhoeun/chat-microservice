import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Two participant ids always map to the same conversation regardless of
   * call order — sort them so `[a, b]` and `[b, a]` land on one row.
   */
  private canonicalize(participantIds: [string, string]): [string, string] {
    return [...participantIds].sort() as [string, string];
  }

  private isParticipant(
    conversation: { participant_one_id: string; participant_two_id: string },
    participantId: string,
  ): boolean {
    return (
      conversation.participant_one_id === participantId ||
      conversation.participant_two_id === participantId
    );
  }

  /**
   * Get the existing 1:1 conversation for this pair of participants, or
   * create it. Idempotent — safe to call every time a chat UI opens.
   */
  async getOrCreateConversation(clientId: number, participantIds: [string, string]) {
    if (participantIds[0] === participantIds[1])
      throw new ForbiddenException(
        'A conversation needs two distinct participants!||ការសន្ទនាត្រូវការអ្នកចូលរួមពីរខុសគ្នា!',
      );

    const [participant_one_id, participant_two_id] = this.canonicalize(participantIds);

    const existing = await this.prismaService.conversations.findUnique({
      where: {
        client_id_participant_one_id_participant_two_id: {
          client_id: clientId,
          participant_one_id,
          participant_two_id,
        },
      },
    });

    if (existing) return existing;

    return this.prismaService.conversations.create({
      data: { client_id: clientId, participant_one_id, participant_two_id },
    });
  }

  /** Conversations a participant is in, newest activity first, with unread counts. */
  async listConversations(clientId: number, participantId: string, page: number, limit: number) {
    const where = {
      client_id: clientId,
      OR: [{ participant_one_id: participantId }, { participant_two_id: participantId }],
    };

    const [conversations, total] = await Promise.all([
      this.prismaService.conversations.findMany({
        where,
        orderBy: [{ last_message_at: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { messages: { orderBy: { created_at: 'desc' }, take: 1 } },
      }),
      this.prismaService.conversations.count({ where }),
    ]);

    const data = await Promise.all(
      conversations.map(async ({ messages, ...conversation }) => {
        const readAt =
          conversation.participant_one_id === participantId
            ? conversation.participant_one_read_at
            : conversation.participant_two_read_at;

        const unread_count = await this.prismaService.messages.count({
          where: {
            conversation_id: conversation.id,
            sender_id: { not: participantId },
            created_at: { gt: readAt ?? new Date(0) },
          },
        });

        return { ...conversation, last_message: messages[0] ?? null, unread_count };
      }),
    );

    return { data, page, limit, total, total_pages: Math.ceil(total / limit) };
  }

  /** Fetch a conversation, verifying `participantId` actually belongs to it. */
  async getConversation(clientId: number, conversationId: number, participantId: string) {
    const conversation = await this.prismaService.conversations.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.client_id !== clientId)
      throw new NotFoundException('Conversation not found!||រកមិនឃើញការសន្ទនាទេ!');

    if (!this.isParticipant(conversation, participantId))
      throw new ForbiddenException(
        'You are not a participant of this conversation!||អ្នកមិនមែនជាអ្នកចូលរួមក្នុងការសន្ទនានេះទេ!',
      );

    return conversation;
  }

  async sendMessage(clientId: number, conversationId: number, senderId: string, body: string) {
    // reuses the same access check as reads — a sender must be a participant
    const conversation = await this.getConversation(clientId, conversationId, senderId);

    const [message] = await this.prismaService.$transaction([
      this.prismaService.messages.create({
        data: { conversation_id: conversation.id, sender_id: senderId, body },
      }),
      this.prismaService.conversations.update({
        where: { id: conversation.id },
        data: { last_message_at: new Date() },
      }),
    ]);

    return message;
  }

  async listMessages(
    clientId: number,
    conversationId: number,
    participantId: string,
    cursor: number | undefined,
    limit: number,
  ) {
    await this.getConversation(clientId, conversationId, participantId);

    const messages = await this.prismaService.messages.findMany({
      where: {
        conversation_id: conversationId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    return {
      // oldest-first, ready to render top-to-bottom
      data: messages.reverse(),
      next_cursor: messages.length === limit ? messages[0].id : null,
    };
  }

  async markRead(clientId: number, conversationId: number, participantId: string) {
    const conversation = await this.getConversation(clientId, conversationId, participantId);

    const isParticipantOne = conversation.participant_one_id === participantId;

    return this.prismaService.conversations.update({
      where: { id: conversation.id },
      data: isParticipantOne
        ? { participant_one_read_at: new Date() }
        : { participant_two_read_at: new Date() },
    });
  }
}

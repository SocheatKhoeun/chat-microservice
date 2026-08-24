import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { ChatEventsService } from '../../common/services/chat-events/chat-events.service';
import { generateHash } from '../../common/utils/generate-hash.util';
import type { Prisma } from '../../../generated/prisma/client';
import { message_type } from '../../../generated/prisma/enums';
import { ConversationsService } from '../conversations/conversations.service';
import {
  EditMessageDto,
  ForwardMessageDto,
  ListMessagesQueryDto,
  MarkReadResultDto,
  MessageListResponseDto,
  MessageReactionDto,
  MessageResponseDto,
  ReactToMessageDto,
  SendMessageDto,
} from './messages.model';

const messageInclude = {
  replied_message: true,
  attachments: true,
  reactions: true,
} satisfies Prisma.messagesInclude;

type MessageWithRelations = Prisma.messagesGetPayload<{
  include: typeof messageInclude;
}>;

/** The subset of a Prisma `conversations` payload every broadcast helper below actually needs. */
interface ConversationMembership {
  hash: string;
  members: { user_id: string; left_at: Date | null }[];
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async sendMessage(
    currentUserId: string,
    conversationHash: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );

    const repliedMessage = dto.replied_message_hash
      ? await this.assertRepliableMessage(
          conversation.id,
          dto.replied_message_hash,
        )
      : null;

    const created = await this.prismaService.messages.create({
      data: {
        hash: generateHash(),
        conversation_id: conversation.id,
        sender_id: currentUserId,
        type: dto.type ?? message_type.text,
        content: dto.content,
        replied_message_id: repliedMessage?.id,
        attachments: dto.attachments?.length
          ? {
              create: dto.attachments.map((a) => ({
                file_url: a.file_url,
                file_type: a.file_type,
              })),
            }
          : undefined,
      },
      include: messageInclude,
    });

    return new MessageResponseDto(created);
  }

  async markConversationRead(
    currentUserId: string,
    conversationHash: string,
  ): Promise<MarkReadResultDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );

    const unreadMessages = await this.prismaService.messages.findMany({
      where: {
        conversation_id: conversation.id,
        sender_id: { not: currentUserId },
        reads: { none: { user_id: currentUserId } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (unreadMessages.length > 0) {
      await this.prismaService.message_reads.createMany({
        data: unreadMessages.map(({ id }) => ({
          message_id: id,
          user_id: currentUserId,
        })),
      });
    }

    return new MarkReadResultDto({
      conversation_hash: conversation.hash,
      read_count: unreadMessages.length,
      last_read_message_id:
        unreadMessages.length > 0
          ? unreadMessages[unreadMessages.length - 1].id
          : null,
    });
  }

  async listMessages(
    currentUserId: string,
    conversationHash: string,
    query: ListMessagesQueryDto,
  ): Promise<MessageListResponseDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );

    const limit = query.limit ?? 20;

    const found = await this.prismaService.messages.findMany({
      where: {
        conversation_id: conversation.id,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: messageInclude,
      orderBy: { id: 'desc' },
      take: limit,
    });

    const next_cursor =
      found.length === limit ? found[found.length - 1].id : null;

    const data = found.map((message) => new MessageResponseDto(message));

    return new MessageListResponseDto({ data, next_cursor });
  }

  async reactToMessage(
    currentUserId: string,
    conversationHash: string,
    messageHash: string,
    dto: ReactToMessageDto,
  ): Promise<MessageReactionDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );
    const message = await this.getOwnedMessage(conversation.id, messageHash);

    if (message.deleted_at)
      throw new BadRequestException(
        'Cannot react to a deleted message!||មិនអាចធ្វើប្រតិកម្មចំពោះសារដែលបានលុបទេ!',
      );

    // Compound-unique upsert: a second reaction from the same user on the same
    // message replaces the first, atomically — no read-then-write race.
    const reaction = await this.prismaService.message_reactions.upsert({
      where: {
        message_id_user_id: { message_id: message.id, user_id: currentUserId },
      },
      update: { reaction: dto.reaction },
      create: {
        hash: generateHash(),
        message_id: message.id,
        user_id: currentUserId,
        reaction: dto.reaction,
      },
    });

    this.broadcastToConversation(conversation, 'reaction:added', {
      conversation_hash: conversationHash,
      message_hash: messageHash,
      user_id: currentUserId,
      reaction: reaction.reaction,
    });

    return new MessageReactionDto(reaction);
  }

  async removeReaction(
    currentUserId: string,
    conversationHash: string,
    messageHash: string,
  ): Promise<void> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );
    const message = await this.getOwnedMessage(conversation.id, messageHash);

    const deleted = await this.prismaService.message_reactions.deleteMany({
      where: { message_id: message.id, user_id: currentUserId },
    });

    if (deleted.count === 0) return; // nothing to remove — idempotent, not an error

    this.broadcastToConversation(conversation, 'reaction:removed', {
      conversation_hash: conversationHash,
      message_hash: messageHash,
      user_id: currentUserId,
    });
  }

  async editMessage(
    currentUserId: string,
    conversationHash: string,
    messageHash: string,
    dto: EditMessageDto,
  ): Promise<MessageResponseDto> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );
    const message = await this.getOwnedMessage(conversation.id, messageHash);

    if (message.sender_id !== currentUserId)
      throw new ForbiddenException(
        'You can only edit your own messages!||អ្នកអាចកែសម្រួលបានតែសារផ្ទាល់ខ្លួនប៉ុណ្ណោះ!',
      );
    if (message.deleted_at)
      throw new BadRequestException(
        'Cannot edit a deleted message!||មិនអាចកែសម្រួលសារដែលបានលុបទេ!',
      );

    const updated = await this.prismaService.messages.update({
      where: { id: message.id },
      data: { content: dto.content, edited_at: new Date() },
      include: messageInclude,
    });

    const response = new MessageResponseDto(updated);
    this.broadcastToConversation(conversation, 'message:edited', response);

    return response;
  }

  async deleteMessage(
    currentUserId: string,
    conversationHash: string,
    messageHash: string,
  ): Promise<void> {
    const conversation = await this.conversationsService.assertMembership(
      conversationHash,
      currentUserId,
    );
    const message = await this.getOwnedMessage(conversation.id, messageHash);

    if (message.sender_id !== currentUserId)
      throw new ForbiddenException(
        'You can only delete your own messages!||អ្នកអាចលុបបានតែសារផ្ទាល់ខ្លួនប៉ុណ្ណោះ!',
      );
    if (message.deleted_at) return; // already deleted — idempotent

    await this.prismaService.$transaction([
      this.prismaService.message_attachments.deleteMany({
        where: { message_id: message.id },
      }),
      this.prismaService.messages.update({
        where: { id: message.id },
        data: { content: null, deleted_at: new Date() },
      }),
    ]);

    this.broadcastToConversation(conversation, 'message:deleted', {
      conversation_hash: conversationHash,
      message_hash: messageHash,
    });
  }

  async forwardMessage(
    currentUserId: string,
    sourceConversationHash: string,
    messageHash: string,
    dto: ForwardMessageDto,
  ): Promise<MessageResponseDto> {
    // Two independent membership checks — run them concurrently rather than
    // paying for two sequential round trips.
    const [sourceConversation, targetConversation] = await Promise.all([
      this.conversationsService.assertMembership(
        sourceConversationHash,
        currentUserId,
      ),
      this.conversationsService.assertMembership(
        dto.target_conversation_hash,
        currentUserId,
      ),
    ]);

    const source = await this.getOwnedMessage(
      sourceConversation.id,
      messageHash,
    );

    if (source.deleted_at)
      throw new BadRequestException(
        'Cannot forward a deleted message!||មិនអាចបញ្ជូនសារដែលបានលុបបានទេ!',
      );

    const created = await this.prismaService.messages.create({
      data: {
        hash: generateHash(),
        conversation_id: targetConversation.id,
        sender_id: currentUserId,
        type: source.type ?? message_type.text,
        content: source.content,
        attachments: source.attachments.length
          ? {
              create: source.attachments.map((a) => ({
                file_url: a.file_url,
                file_type: a.file_type,
              })),
            }
          : undefined,
      },
      include: messageInclude,
    });

    const response = new MessageResponseDto(created);
    this.broadcastToConversation(targetConversation, 'message:new', response);

    return response;
  }

  /** Fetches a message and confirms it belongs to the given conversation, 404ing otherwise. */
  private async getOwnedMessage(
    conversationId: number,
    messageHash: string,
  ): Promise<MessageWithRelations> {
    const message = await this.prismaService.messages.findUnique({
      where: { hash: messageHash },
      include: messageInclude,
    });

    if (!message || message.conversation_id !== conversationId)
      throw new NotFoundException(
        'Message not found in this conversation!||រកមិនឃើញសារនេះនៅក្នុងការសន្ទនានេះ!',
      );

    return message;
  }

  private async assertRepliableMessage(
    conversationId: number,
    messageHash: string,
  ) {
    const message = await this.prismaService.messages.findUnique({
      where: { hash: messageHash },
    });

    if (!message || message.conversation_id !== conversationId)
      throw new BadRequestException(
        'Replied message not found in this conversation!||រកមិនឃើញសារដែលឆ្លើយតបនៅក្នុងការសន្ទនានេះ!',
      );

    return message;
  }

  private activeMemberIds(conversation: ConversationMembership): string[] {
    return conversation.members
      .filter((member) => !member.left_at)
      .map((member) => member.user_id);
  }

  /**
   * Broadcasts to a conversation using member ids already in hand (from
   * assertMembership, moments earlier in the same request) instead of
   * re-querying them — see the "Redundant member re-query" QA finding.
   */
  private broadcastToConversation(
    conversation: ConversationMembership,
    event: string,
    payload: unknown,
  ): void {
    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.broadcastToConversation(
        conversation.hash,
        this.activeMemberIds(conversation),
        event,
        payload,
      ),
    );
  }
}

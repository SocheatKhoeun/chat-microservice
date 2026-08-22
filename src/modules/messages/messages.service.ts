import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { generateHash } from '../../common/utils/generate-hash.util';
import type { messages } from '../../../generated/prisma/client';
import { message_type } from '../../../generated/prisma/enums';
import { ConversationsService } from '../conversations/conversations.service';
import {
  ListMessagesQueryDto,
  MessageListResponseDto,
  MessageResponseDto,
  RepliedMessageDto,
  SendMessageDto,
} from './messages.model';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly conversationsService: ConversationsService,
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

    let repliedMessage: messages | null = null;

    if (dto.replied_message_hash) {
      repliedMessage = await this.prismaService.messages.findUnique({
        where: { hash: dto.replied_message_hash },
      });

      if (!repliedMessage || repliedMessage.conversation_id !== conversation.id)
        throw new BadRequestException(
          'Replied message not found in this conversation!||រកមិនឃើញសារដែលឆ្លើយតបនៅក្នុងការសន្ទនានេះ!',
        );
    }

    const created = await this.prismaService.messages.create({
      data: {
        hash: generateHash(),
        conversation_id: conversation.id,
        sender_id: currentUserId,
        type: dto.type ?? message_type.text,
        content: dto.content,
        replied_message_id: repliedMessage?.id,
      },
    });

    return {
      ...created,
      replied_message: repliedMessage
        ? new RepliedMessageDto(repliedMessage)
        : null,
    };
  }

  async markConversationRead(currentUserId: string, conversationHash: string) {
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

    return {
      conversation_hash: conversation.hash,
      read_count: unreadMessages.length,
      last_read_message_id:
        unreadMessages.length > 0
          ? unreadMessages[unreadMessages.length - 1].id
          : null,
    };
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
      include: { replied_message: true },
      orderBy: { id: 'desc' },
      take: limit,
    });

    const next_cursor =
      found.length === limit ? found[found.length - 1].id : null;

    const data = found.map((message) => ({
      ...message,
      replied_message: message.replied_message
        ? new RepliedMessageDto(message.replied_message)
        : null,
    }));

    return { data, next_cursor };
  }
}

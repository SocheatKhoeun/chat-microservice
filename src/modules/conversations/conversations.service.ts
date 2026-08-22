import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { generateHash } from '../../common/utils/generate-hash.util';
import { conversation_type, message_type } from '../../../generated/prisma/enums';
import {
  ConversationListResponseDto,
  ConversationResponseDto,
  ListConversationsQueryDto,
  StartDirectConversationDto,
} from './conversations.model';
import { RepliedMessageDto } from '../messages/messages.model';

@Injectable()
export class ConversationsService {
  constructor(private readonly prismaService: PrismaService) {}

  async startDirectConversation(
    currentUserId: string,
    dto: StartDirectConversationDto,
  ): Promise<ConversationResponseDto> {
    const targetUser = await this.prismaService.users.findUnique({
      where: { id: dto.external_id },
    });

    if (!targetUser)
      throw new NotFoundException('User not found!||រកមិនឃើញអ្នកប្រើប្រាស់!');

    const targetUserId = targetUser.id;

    if (targetUserId === currentUserId)
      throw new BadRequestException(
        'You cannot start a conversation with yourself!||អ្នកមិនអាចជជែកជាមួយខ្លួនឯងបានទេ!',
      );

    const { conversation, message } = await this.prismaService.$transaction(
      async (tx) => {
        let conversation = await tx.conversations.findFirst({
          where: {
            type: conversation_type.direct,
            AND: [
              { members: { some: { user_id: currentUserId, left_at: null } } },
              { members: { some: { user_id: targetUserId, left_at: null } } },
            ],
          },
          include: { members: true },
        });

        if (!conversation) {
          const created = await tx.conversations.create({
            data: {
              hash: generateHash(),
              type: conversation_type.direct,
              created_by: currentUserId,
            },
          });

          await tx.conversation_members.createMany({
            data: [
              { conversation_id: created.id, user_id: currentUserId },
              { conversation_id: created.id, user_id: targetUserId },
            ],
          });

          conversation = await tx.conversations.findUniqueOrThrow({
            where: { id: created.id },
            include: { members: true },
          });
        }

        // Every "start" always sends a message, so the other user has something to be
        // notified about — whether the conversation is brand new or already existed.
        const message = await tx.messages.create({
          data: {
            hash: generateHash(),
            conversation_id: conversation.id,
            sender_id: currentUserId,
            type: message_type.text,
            content: dto.message,
          },
        });

        return { conversation, message };
      },
    );

    return {
      id: conversation.id,
      hash: conversation.hash,
      type: conversation.type,
      sender_id: targetUser.id,
      message: { ...message, replied_message: null },
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    };
  }

  async listConversations(
    currentUserId: string,
    query: ListConversationsQueryDto,
  ): Promise<ConversationListResponseDto> {
    const limit = query.take ?? 30;

    const conversations = await this.prismaService.conversations.findMany({
      where: {
        members: { some: { user_id: currentUserId, left_at: null } },
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: {
        members: true,
        messages: {
          orderBy: { id: 'desc' },
          take: 1,
          include: { replied_message: true },
        },
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    // conversation_members.user_id already IS the other user's external id, so no extra lookup is needed.
    const items = conversations.map((conversation) => {
      const otherMember = conversation.members.find(
        (member) => member.user_id !== currentUserId,
      );
      const lastMessage = conversation.messages[0];

      return {
        id: conversation.id,
        hash: conversation.hash,
        type: conversation.type,
        sender_id:
          conversation.type === conversation_type.direct && otherMember
            ? otherMember.user_id
            : null,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        last_message: lastMessage
          ? {
              ...lastMessage,
              replied_message: lastMessage.replied_message
                ? new RepliedMessageDto(lastMessage.replied_message)
                : null,
            }
          : null,
      };
    });

    const next_cursor =
      items.length === limit ? items[items.length - 1].id : null;

    return { data: items, next_cursor };
  }

  async assertMembership(conversationHash: string, userId: string) {
    const conversation = await this.prismaService.conversations.findUnique({
      where: { hash: conversationHash },
      include: { members: true },
    });

    if (!conversation)
      throw new NotFoundException(
        'Conversation not found!||រកមិនឃើញការសន្ទនា!',
      );

    const isMember = conversation.members.some(
      (member) => member.user_id === userId && !member.left_at,
    );

    if (!isMember)
      throw new ForbiddenException(
        'You are not a member of this conversation!||អ្នកមិនមែនជាសមាជិកនៃការសន្ទនានេះទេ!',
      );

    return conversation;
  }
}

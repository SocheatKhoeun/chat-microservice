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
import {
  conversation_member_role,
  conversation_type,
  message_type,
} from '../../../generated/prisma/enums';
import {
  AddGroupMembersDto,
  ConversationListItemDto,
  ConversationListResponseDto,
  ConversationResponseDto,
  CreateGroupConversationDto,
  GroupConversationResponseDto,
  GroupMemberDto,
  ListConversationsQueryDto,
  StartDirectConversationDto,
  UpdateGroupDto,
  UpdateMemberRoleDto,
} from './conversations.model';

type ConversationWithMembers = Prisma.conversationsGetPayload<{
  include: { members: true };
}>;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async startDirectConversation(
    currentUserId: string,
    dto: StartDirectConversationDto,
  ): Promise<ConversationResponseDto> {
    const targetUser = await this.prismaService.users.findUnique({
      where: { id: dto.user_id },
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

    const response = new ConversationResponseDto({
      id: conversation.id,
      hash: conversation.hash,
      type: conversation.type,
      sender_id: targetUser.id,
      message,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    });

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUser(targetUserId, 'conversation_started', {
        ...response,
        sender_id: currentUserId,
      }),
    );

    return response;
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
          include: {
            replied_message: true,
            attachments: true,
            reactions: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    // conversation_members.user_id already IS the other user's id, so no extra lookup is needed.
    const items = conversations.map((conversation) => {
      const otherMember = conversation.members.find(
        (member) => member.user_id !== currentUserId,
      );

      return new ConversationListItemDto({
        id: conversation.id,
        hash: conversation.hash,
        type: conversation.type,
        sender_id:
          conversation.type === conversation_type.direct && otherMember
            ? otherMember.user_id
            : null,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        last_message: conversation.messages[0] ?? null,
      });
    });

    const next_cursor =
      items.length === limit ? items[items.length - 1].id : null;

    return new ConversationListResponseDto({ data: items, next_cursor });
  }

  async listMemberUserIds(conversationHash: string): Promise<string[]> {
    const conversation = await this.prismaService.conversations.findUnique({
      where: { hash: conversationHash },
      include: { members: true },
    });

    return (
      conversation?.members
        .filter((member) => !member.left_at)
        .map((member) => member.user_id) ?? []
    );
  }

  /** Every other user this person shares at least one active conversation with — who presence changes go to. */
  async listContactUserIds(userId: string): Promise<string[]> {
    const contacts = await this.prismaService.conversation_members.findMany({
      where: {
        left_at: null,
        user_id: { not: userId },
        conversation: {
          members: { some: { user_id: userId, left_at: null } },
        },
      },
      select: { user_id: true },
      distinct: ['user_id'],
    });

    return contacts.map((member) => member.user_id);
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

  async createGroupConversation(
    currentUserId: string,
    dto: CreateGroupConversationDto,
  ): Promise<GroupConversationResponseDto> {
    const memberIds = [...new Set(dto.member_user_ids)].filter(
      (id) => id !== currentUserId,
    );

    if (memberIds.length === 0)
      throw new BadRequestException(
        'A group needs at least one other member!||ក្រុមត្រូវការសមាជិកយ៉ាងហោចណាស់ម្នាក់ទៀត!',
      );

    await this.assertUsersExist(memberIds);

    const conversation = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.conversations.create({
        data: {
          hash: generateHash(),
          type: conversation_type.group,
          name: dto.name,
          description: dto.description,
          avatar_url: dto.avatar_url,
          created_by: currentUserId,
        },
      });

      await tx.conversation_members.createMany({
        data: [
          {
            conversation_id: created.id,
            user_id: currentUserId,
            role: conversation_member_role.owner,
          },
          ...memberIds.map((user_id) => ({
            conversation_id: created.id,
            user_id,
            role: conversation_member_role.member,
          })),
        ],
      });

      return tx.conversations.findUniqueOrThrow({
        where: { id: created.id },
        include: { members: true },
      });
    });

    const response = new GroupConversationResponseDto(conversation);

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUsers(memberIds, 'group:created', response),
    );

    return response;
  }

  async updateGroupInfo(
    currentUserId: string,
    conversationHash: string,
    dto: UpdateGroupDto,
  ): Promise<GroupConversationResponseDto> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );
    this.assertGroupType(conversation);
    this.assertGroupAdmin(conversation, currentUserId);

    const updated = await this.prismaService.conversations.update({
      where: { id: conversation.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.avatar_url !== undefined ? { avatar_url: dto.avatar_url } : {}),
      },
      include: { members: true },
    });

    const response = new GroupConversationResponseDto(updated);

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.broadcastToConversation(
        conversationHash,
        this.activeMemberIds(updated),
        'group:updated',
        response,
      ),
    );

    return response;
  }

  async listGroupMembers(
    currentUserId: string,
    conversationHash: string,
  ): Promise<GroupMemberDto[]> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );

    return conversation.members
      .filter((member) => !member.left_at)
      .map((member) => new GroupMemberDto(member));
  }

  async addGroupMembers(
    currentUserId: string,
    conversationHash: string,
    dto: AddGroupMembersDto,
  ): Promise<GroupMemberDto[]> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );
    this.assertGroupType(conversation);
    this.assertGroupAdmin(conversation, currentUserId);

    const activeIds = new Set(this.activeMemberIds(conversation));
    const newIds = [...new Set(dto.member_user_ids)].filter(
      (id) => !activeIds.has(id),
    );

    if (newIds.length === 0)
      throw new BadRequestException(
        'No new members to add!||គ្មានសមាជិកថ្មីត្រូវបន្ថែមទេ!',
      );

    await this.assertUsersExist(newIds);

    const joinedAt = new Date();

    await this.prismaService.conversation_members.createMany({
      data: newIds.map((user_id) => ({
        conversation_id: conversation.id,
        user_id,
        role: conversation_member_role.member,
        joined_at: joinedAt,
      })),
    });

    // Build the result from what we already know instead of re-fetching the
    // whole conversation+members: the pre-existing active members (already
    // loaded by assertMembership) plus the rows just inserted above.
    const existingMembers = conversation.members
      .filter((member) => !member.left_at)
      .map((member) => new GroupMemberDto(member));
    const newMembers = newIds.map(
      (user_id) =>
        new GroupMemberDto({
          user_id,
          role: conversation_member_role.member,
          nickname: null,
          joined_at: joinedAt,
        }),
    );

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.broadcastToConversation(
        conversationHash,
        [...activeIds, ...newIds],
        'member:added',
        {
          conversation_hash: conversationHash,
          added_by: currentUserId,
          member_user_ids: newIds,
        },
      ),
    );

    return [...existingMembers, ...newMembers];
  }

  async removeGroupMember(
    currentUserId: string,
    conversationHash: string,
    targetUserId: string,
  ): Promise<void> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );
    this.assertGroupType(conversation);

    const targetMember = conversation.members.find(
      (member) => member.user_id === targetUserId && !member.left_at,
    );

    if (!targetMember)
      throw new NotFoundException(
        'That user is not a member of this group!||អ្នកប្រើប្រាស់នេះមិនមែនជាសមាជិកនៃក្រុមនេះទេ!',
      );

    const isSelf = targetUserId === currentUserId;

    if (!isSelf) {
      this.assertGroupAdmin(conversation, currentUserId);

      if (targetMember.role === conversation_member_role.owner)
        throw new ForbiddenException(
          'The group owner cannot be removed!||ម្ចាស់ក្រុមមិនអាចត្រូវបានដកចេញបានទេ!',
        );

      const actingMember = conversation.members.find(
        (member) => member.user_id === currentUserId,
      );

      if (
        targetMember.role === conversation_member_role.admin &&
        actingMember?.role !== conversation_member_role.owner
      )
        throw new ForbiddenException(
          'Only the group owner can remove an admin!||មានតែម្ចាស់ក្រុមទេដែលអាចដកអ្នកគ្រប់គ្រងចេញបាន!',
        );
    }

    await this.prismaService.conversation_members.update({
      where: { id: targetMember.id },
      data: { left_at: new Date() },
    });

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.broadcastToConversation(
        conversationHash,
        this.activeMemberIds(conversation),
        'member:removed',
        {
          conversation_hash: conversationHash,
          user_id: targetUserId,
          removed_by: currentUserId,
        },
      ),
    );
  }

  async updateMemberRole(
    currentUserId: string,
    conversationHash: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<GroupMemberDto> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );
    this.assertGroupType(conversation);

    const actingMember = conversation.members.find(
      (member) => member.user_id === currentUserId && !member.left_at,
    );

    if (actingMember?.role !== conversation_member_role.owner)
      throw new ForbiddenException(
        'Only the group owner can change member roles!||មានតែម្ចាស់ក្រុមទេដែលអាចផ្លាស់ប្តូរតួនាទីសមាជិកបាន!',
      );

    if (targetUserId === currentUserId)
      throw new BadRequestException(
        "You can't change your own role!||អ្នកមិនអាចផ្លាស់ប្តូរតួនាទីខ្លួនឯងបានទេ!",
      );

    const targetMember = conversation.members.find(
      (member) => member.user_id === targetUserId && !member.left_at,
    );

    if (!targetMember)
      throw new NotFoundException(
        'That user is not a member of this group!||អ្នកប្រើប្រាស់នេះមិនមែនជាសមាជិកនៃក្រុមនេះទេ!',
      );

    const updated = await this.prismaService.conversation_members.update({
      where: { id: targetMember.id },
      data: { role: dto.role },
    });

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.broadcastToConversation(
        conversationHash,
        this.activeMemberIds(conversation),
        'member:role_updated',
        {
          conversation_hash: conversationHash,
          user_id: targetUserId,
          role: dto.role,
        },
      ),
    );

    return new GroupMemberDto(updated);
  }

  private async assertUsersExist(userIds: string[]): Promise<void> {
    const found = await this.prismaService.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });

    if (found.length === userIds.length) return;

    const foundIds = new Set(found.map((user) => user.id));
    const missing = userIds.filter((id) => !foundIds.has(id));

    throw new NotFoundException(
      `User(s) not found: ${missing.join(', ')}||រកមិនឃើញអ្នកប្រើប្រាស់មួយចំនួន!`,
    );
  }

  private assertGroupType(conversation: ConversationWithMembers): void {
    if (conversation.type !== conversation_type.group)
      throw new BadRequestException(
        'This only applies to group conversations!||នេះអនុវត្តតែចំពោះការសន្ទនាជាក្រុមប៉ុណ្ណោះ!',
      );
  }

  private assertGroupAdmin(
    conversation: ConversationWithMembers,
    userId: string,
  ): void {
    const member = conversation.members.find(
      (m) => m.user_id === userId && !m.left_at,
    );

    const isAdmin =
      member?.role === conversation_member_role.owner ||
      member?.role === conversation_member_role.admin;

    if (!isAdmin)
      throw new ForbiddenException(
        'Only a group owner or admin can do this!||មានតែម្ចាស់ក្រុម ឬអ្នកគ្រប់គ្រងទេដែលអាចធ្វើវាបាន!',
      );
  }

  private activeMemberIds(conversation: ConversationWithMembers): string[] {
    return conversation.members
      .filter((member) => !member.left_at)
      .map((member) => member.user_id);
  }
}

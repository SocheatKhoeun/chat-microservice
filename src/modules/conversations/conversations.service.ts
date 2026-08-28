import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { ChatEventsService } from '../../common/services/chat-events/chat-events.service';
import { generateHash } from '../../common/utils/generate-hash.util';
import { directConversationKey } from '../../common/utils/conversation-key.util';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import type { Prisma, conversations } from '../../../generated/prisma/client';
import {
  conversation_member_role,
  conversation_type,
  message_type,
} from '../../../generated/prisma/enums';
import { BlocksService } from '../blocks/blocks.service';
import {
  AddGroupMembersDto,
  ConversationListItemDto,
  ConversationListResponseDto,
  ConversationResponseDto,
  ConversationSettingsDto,
  CreateGroupConversationDto,
  GroupConversationResponseDto,
  GroupMemberDto,
  ListConversationsQueryDto,
  StartDirectConversationDto,
  UpdateConversationSettingsDto,
  UpdateGroupDto,
  UpdateMemberRoleDto,
} from './conversations.model';

type ConversationWithMembers = Prisma.conversationsGetPayload<{
  include: { members: { include: { user: true } } };
}>;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly settingService: SettingService,
    private readonly chatEventsService: ChatEventsService,
    private readonly blocksService: BlocksService,
  ) {}

  async startDirectConversation(
    currentUserId: string,
    dto: StartDirectConversationDto,
    oauthClientId: number | null,
  ): Promise<ConversationResponseDto> {
    const targetUser = await this.findOrCreateUser(dto.user_id, oauthClientId);

    const targetUserId = targetUser.id;

    if (targetUserId === currentUserId)
      throw new BadRequestException(
        'You cannot start a conversation with yourself!||អ្នកមិនអាចជជែកជាមួយខ្លួនឯងបានទេ!',
      );

    await this.blocksService.assertNotBlocked(currentUserId, targetUserId);

    const directConversation = await this.findOrCreateDirectConversation(
      currentUserId,
      targetUserId,
    );

    const { conversation, message } = await this.prismaService.$transaction(
      async (tx) => {
        await tx.conversation_members.createMany({
          data: [
            { conversation_id: directConversation.id, user_id: currentUserId },
            { conversation_id: directConversation.id, user_id: targetUserId },
          ],
          skipDuplicates: true,
        });

        const conversation = await tx.conversations.findUniqueOrThrow({
          where: { id: directConversation.id },
          include: { members: true },
        });

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

    const baseUrl = await this.settingService.getS3PublicUrl();
    const response = new ConversationResponseDto(
      {
        id: conversation.id,
        hash: conversation.hash,
        type: conversation.type,
        sender_id: targetUser.id,
        message,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
      baseUrl,
    );

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
    const archived = query.archived ?? false;

    const memberships = await this.prismaService.conversation_members.findMany({
      where: {
        user_id: currentUserId,
        left_at: null,
        is_archived: archived,
        ...(query.cursor ? { conversation_id: { lt: query.cursor } } : {}),
      },
      orderBy: [{ is_pinned: 'desc' }, { conversation_id: 'desc' }],
      take: limit,
      include: {
        conversation: {
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
        },
      },
    });

    const conversationIds = memberships.map((m) => m.conversation_id);
    const unreadCounts = await this.unreadCountsByConversation(
      currentUserId,
      conversationIds,
    );
    const baseUrl = await this.settingService.getS3PublicUrl();

    // conversation_members.user_id already IS the other user's id, so no extra lookup is needed.
    const items = memberships.map((membership) => {
      const conversation = membership.conversation;
      const otherMember = conversation.members.find(
        (member) => member.user_id !== currentUserId,
      );

      return new ConversationListItemDto(
        {
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
          is_muted: membership.is_muted,
          is_archived: membership.is_archived,
          is_pinned: membership.is_pinned,
          unread_count: unreadCounts.get(conversation.id) ?? 0,
        },
        baseUrl,
      );
    });

    const next_cursor =
      items.length === limit ? items[items.length - 1].id : null;

    const total_unread_conversations =
      await this.prismaService.conversation_members.count({
        where: {
          user_id: currentUserId,
          left_at: null,
          is_archived: false,
          conversation: {
            messages: {
              some: {
                sender_id: { not: currentUserId },
                reads: { none: { user_id: currentUserId } },
              },
            },
          },
        },
      });

    return new ConversationListResponseDto({
      data: items,
      next_cursor,
      total_unread_conversations,
    });
  }

  /** { conversation_id -> count of messages in it unread by this user }. */
  private async unreadCountsByConversation(
    currentUserId: string,
    conversationIds: number[],
  ): Promise<Map<number, number>> {
    if (conversationIds.length === 0) return new Map();

    const grouped = await this.prismaService.messages.groupBy({
      by: ['conversation_id'],
      where: {
        conversation_id: { in: conversationIds },
        sender_id: { not: currentUserId },
        reads: { none: { user_id: currentUserId } },
      },
      _count: { _all: true },
    });

    return new Map(
      grouped.map((row) => [row.conversation_id, row._count._all]),
    );
  }

  async updateConversationSettings(
    currentUserId: string,
    conversationHash: string,
    dto: UpdateConversationSettingsDto,
  ): Promise<ConversationSettingsDto> {
    const conversation = await this.assertMembership(
      conversationHash,
      currentUserId,
    );

    const member = conversation.members.find(
      (m) => m.user_id === currentUserId && !m.left_at,
    );

    if (!member)
      throw new ForbiddenException(
        'You are not a member of this conversation!||អ្នកមិនមែនជាសមាជិកនៃការសន្ទនានេះទេ!',
      );

    const updated = await this.prismaService.conversation_members.update({
      where: { id: member.id },
      data: {
        ...(dto.is_muted !== undefined ? { is_muted: dto.is_muted } : {}),
        ...(dto.is_archived !== undefined
          ? { is_archived: dto.is_archived }
          : {}),
        ...(dto.is_pinned !== undefined
          ? {
              is_pinned: dto.is_pinned,
              pinned_at: dto.is_pinned ? new Date() : null,
            }
          : {}),
      },
    });

    const response = new ConversationSettingsDto({
      conversation_hash: conversationHash,
      is_muted: updated.is_muted,
      is_archived: updated.is_archived,
      is_pinned: updated.is_pinned,
      pinned_at: updated.pinned_at,
    });

    // Self-only setting — broadcast to this user's other devices, never the
    // rest of the conversation (nobody else needs to know you muted them).
    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUser(
        currentUserId,
        'conversation:settings_updated',
        response,
      ),
    );

    return response;
  }

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
      include: { members: { include: { user: true } } },
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
        include: { members: { include: { user: true } } },
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
      include: { members: { include: { user: true } } },
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

    const isOwnerLeaving =
      isSelf && targetMember.role === conversation_member_role.owner;
    const remainingActiveMembers = conversation.members.filter(
      (member) => member.user_id !== targetUserId && !member.left_at,
    );
    const hasRemainingOwner = remainingActiveMembers.some(
      (member) => member.role === conversation_member_role.owner,
    );

    const successor =
      isOwnerLeaving && !hasRemainingOwner
        ? this.findOwnerSuccessor(remainingActiveMembers)
        : null;

    await this.prismaService.$transaction(async (tx) => {
      await tx.conversation_members.update({
        where: { id: targetMember.id },
        data: { left_at: new Date() },
      });

      if (successor)
        await tx.conversation_members.update({
          where: { id: successor.id },
          data: { role: conversation_member_role.owner },
        });
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

    if (successor)
      this.chatEventsService.safeBroadcast(() =>
        this.chatEventsService.broadcastToConversation(
          conversationHash,
          this.activeMemberIds(conversation),
          'member:role_updated',
          {
            conversation_hash: conversationHash,
            user_id: successor.user_id,
            role: conversation_member_role.owner,
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
      include: { user: true },
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

  private async findOrCreateUser(userId: string, oauthClientId: number | null) {
    const existing = await this.prismaService.users.findUnique({
      where: { id: userId },
    });

    if (existing) return existing;

    try {
      return await this.prismaService.users.create({
        data: { id: userId, oauth_client_id: oauthClientId },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      return this.prismaService.users.findUniqueOrThrow({
        where: { id: userId },
      });
    }
  }

  private async findOrCreateDirectConversation(
    userIdA: string,
    userIdB: string,
  ): Promise<conversations> {
    const key = directConversationKey(userIdA, userIdB);

    try {
      return await this.prismaService.conversations.upsert({
        where: { direct_key: key },
        update: {},
        create: {
          hash: generateHash(),
          type: conversation_type.direct,
          created_by: userIdA,
          direct_key: key,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      return this.prismaService.conversations.findUniqueOrThrow({
        where: { direct_key: key },
      });
    }
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

  private findOwnerSuccessor(
    candidates: ConversationWithMembers['members'],
  ): ConversationWithMembers['members'][number] | null {
    const byTenure = [...candidates].sort(
      (a, b) => a.joined_at.getTime() - b.joined_at.getTime(),
    );

    return (
      byTenure.find(
        (member) => member.role === conversation_member_role.admin,
      ) ??
      byTenure.find(
        (member) => member.role === conversation_member_role.member,
      ) ??
      null
    );
  }

  private activeMemberIds(conversation: ConversationWithMembers): string[] {
    return conversation.members
      .filter((member) => !member.left_at)
      .map((member) => member.user_id);
  }
}

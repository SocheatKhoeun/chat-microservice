import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { ChatEventsService } from '../../common/services/chat-events/chat-events.service';
import { isUniqueConstraintViolation } from '../../common/utils/prisma-error.util';
import type { blocked_users } from '../../../generated/prisma/client';
import { BlockedUserDto, BlockedUserListResponseDto } from './blocks.model';

@Injectable()
export class BlocksService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  async blockUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<BlockedUserDto> {
    if (targetUserId === currentUserId)
      throw new BadRequestException(
        'You cannot block yourself!||អ្នកមិនអាចទប់ស្កាត់ខ្លួនឯងបានទេ!',
      );

    const target = await this.prismaService.users.findUnique({
      where: { id: targetUserId },
    });

    if (!target)
      throw new NotFoundException('User not found!||រកមិនឃើញអ្នកប្រើប្រាស់!');

    let block: blocked_users;
    try {
      block = await this.prismaService.blocked_users.upsert({
        where: {
          blocker_id_blocked_id: {
            blocker_id: currentUserId,
            blocked_id: targetUserId,
          },
        },
        update: {},
        create: { blocker_id: currentUserId, blocked_id: targetUserId },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      block = await this.prismaService.blocked_users.findUniqueOrThrow({
        where: {
          blocker_id_blocked_id: {
            blocker_id: currentUserId,
            blocked_id: targetUserId,
          },
        },
      });
    }

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUser(currentUserId, 'user:blocked', {
        user_id: targetUserId,
        created_at: block.created_at,
      }),
    );

    return new BlockedUserDto(block);
  }

  async unblockUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const deleted = await this.prismaService.blocked_users.deleteMany({
      where: { blocker_id: currentUserId, blocked_id: targetUserId },
    });

    if (deleted.count === 0) return; // wasn't blocked — idempotent, not an error

    this.chatEventsService.safeBroadcast(() =>
      this.chatEventsService.notifyUser(currentUserId, 'user:unblocked', {
        user_id: targetUserId,
      }),
    );
  }

  async listBlockedUsers(
    currentUserId: string,
  ): Promise<BlockedUserListResponseDto> {
    const blocks = await this.prismaService.blocked_users.findMany({
      where: { blocker_id: currentUserId },
      orderBy: { id: 'desc' },
    });

    return new BlockedUserListResponseDto(
      blocks.map((block) => new BlockedUserDto(block)),
    );
  }

  async isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
    const count = await this.prismaService.blocked_users.count({
      where: {
        OR: [
          { blocker_id: userA, blocked_id: userB },
          { blocker_id: userB, blocked_id: userA },
        ],
      },
    });

    return count > 0;
  }

  async assertNotBlocked(userA: string, userB: string): Promise<void> {
    if (await this.isBlockedEitherWay(userA, userB))
      throw new ForbiddenException(
        'You cannot message this user!||អ្នកមិនអាចផ្ញើសារទៅអ្នកប្រើប្រាស់នេះបានទេ!',
      );
  }
}

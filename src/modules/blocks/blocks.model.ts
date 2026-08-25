import { ApiProperty } from '@nestjs/swagger';
import type { blocked_users } from '../../../generated/prisma/client';

export class BlockedUserDto {
  @ApiProperty({
    description: "The blocked user's unique identifier in the calling system.",
  })
  user_id: string;

  @ApiProperty({ description: 'When this user was blocked.' })
  created_at: Date;

  constructor(block: Pick<blocked_users, 'blocked_id' | 'created_at'>) {
    this.user_id = block.blocked_id;
    this.created_at = block.created_at;
  }
}

export class BlockedUserListResponseDto {
  @ApiProperty({ type: [BlockedUserDto] })
  data: BlockedUserDto[];

  constructor(data: BlockedUserDto[]) {
    this.data = data;
  }
}

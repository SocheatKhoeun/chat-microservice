import { ApiProperty } from '@nestjs/swagger';
import type { users } from '../../../generated/prisma/client';

export class ProfileResponseDto implements Pick<
  users,
  'id' | 'created_at' | 'updated_at'
> {
  @ApiProperty({
    description:
      "The user's unique identifier (their id in the calling system, or a generated one for anonymous users).",
  })
  id: string;

  @ApiProperty({ description: 'When the user was created.' })
  created_at: Date;

  @ApiProperty({ description: 'When the user was last updated.' })
  updated_at: Date;

  constructor(user: Pick<users, 'id' | 'created_at' | 'updated_at'>) {
    this.id = user.id;
    this.created_at = user.created_at;
    this.updated_at = user.updated_at;
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { users } from '../../../generated/prisma/client';

export class ProfileResponseDto
  implements Pick<users, 'id' | 'external_id' | 'created_at' | 'updated_at'>
{
  @ApiProperty({ description: 'The internal id of the user.' })
  id!: number;

  @ApiPropertyOptional({
    description: "The user's unique identifier in the calling system.",
    nullable: true,
  })
  external_id!: string | null;

  @ApiProperty({ description: 'When the user was created.' })
  created_at!: Date;

  @ApiProperty({ description: 'When the user was last updated.' })
  updated_at!: Date;
}

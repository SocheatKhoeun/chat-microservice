import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { users } from '../../../generated/prisma/client';

export class CreateUserDto implements Pick<users, 'external_id'> {
  @ApiPropertyOptional({
    description:
      "The user's unique identifier in the calling system. Omit to create an anonymous user.",
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  external_id!: string;
}

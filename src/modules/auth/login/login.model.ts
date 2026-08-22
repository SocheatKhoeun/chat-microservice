import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { users } from '../../../../generated/prisma/client';

export class LoginDto implements Pick<users, 'external_id'> {
  @ApiPropertyOptional({
    description: "The user's unique identifier in the calling system. Omit to log in as a new anonymous user.",
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  external_id!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty({
    description: 'The JWT access token for the authenticated user.',
  })
  access_token!: string;
}

export interface AccessTokenPayload {
  sub: number;
  external_id: string | null;
  client_id: number;
}

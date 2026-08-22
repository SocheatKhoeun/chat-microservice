import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    description:
      "The user's unique identifier in the calling system. Omit to log in as a new anonymous user.",
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
  sub: string;
  client_id: number;
}

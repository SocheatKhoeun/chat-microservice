import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    description:
      "The user's own unique identifier. Omit to log in as a new anonymous user (a random id is generated).",
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user_id!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty({
    description: 'The JWT access token for the authenticated user.',
  })
  access_token: string;

  constructor(access_token: string) {
    this.access_token = access_token;
  }
}

export interface AccessTokenPayload {
  sub: string;
  client_id: number;
}

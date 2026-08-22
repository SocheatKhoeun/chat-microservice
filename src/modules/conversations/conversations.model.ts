import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { conversations } from '../../../generated/prisma/client';
import { conversation_type } from '../../../generated/prisma/enums';
import { MessageResponseDto } from '../messages/messages.model';

export class StartDirectConversationDto {
  @ApiProperty({
    description: "The other user's unique identifier in the calling system.",
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  external_id!: string;

  @ApiProperty({
    description:
      'The first message to send, so the other user is notified of the new conversation.',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message!: string;
}

export class ConversationResponseDto implements Pick<
  conversations,
  'id' | 'hash' | 'type' | 'created_at' | 'updated_at'
> {
  @ApiProperty({ description: 'The internal id of the conversation.' })
  id!: number;

  @ApiProperty({ description: 'The public hash of the conversation.' })
  hash!: string;

  @ApiProperty({ enum: conversation_type, nullable: true })
  type!: conversation_type | null;

  @ApiPropertyOptional({
    description:
      "The other participant's external id, nullable if their account has none.",
    type: String,
    nullable: true,
  })
  sender_id!: string | null;

  @ApiProperty({
    description: 'The message that was just sent to start this conversation.',
    type: MessageResponseDto,
  })
  message!: MessageResponseDto;

  @ApiProperty({ description: 'When the conversation was created.' })
  created_at!: Date;

  @ApiProperty({ description: 'When the conversation was last updated.' })
  updated_at!: Date;
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({
    description:
      'Return conversations older than this conversation id (cursor-based pagination).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiPropertyOptional({
    description: 'Max number of conversations to return.',
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class ConversationListItemDto implements Pick<
  conversations,
  'id' | 'hash' | 'type' | 'created_at' | 'updated_at'
> {
  @ApiProperty({ description: 'The internal id of the conversation.' })
  id!: number;

  @ApiProperty({ description: 'The public hash of the conversation.' })
  hash!: string;

  @ApiProperty({ enum: conversation_type, nullable: true })
  type!: conversation_type | null;

  @ApiProperty({ description: 'When the conversation was created.' })
  created_at!: Date;

  @ApiProperty({ description: 'When the conversation was last updated.' })
  updated_at!: Date;

  @ApiPropertyOptional({
    description:
      "The other participant's external id (direct conversations only), nullable if their account has none.",
    type: String,
    nullable: true,
  })
  sender_id!: string | null;

  @ApiPropertyOptional({
    description: 'The most recent message in this conversation, if any.',
    type: MessageResponseDto,
    nullable: true,
  })
  last_message!: MessageResponseDto | null;
}

export class ConversationListResponseDto {
  @ApiProperty({ type: [ConversationListItemDto] })
  data!: ConversationListItemDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` to fetch the next (older) page. Null when there are no more conversations.',
    type: Number,
    nullable: true,
  })
  next_cursor!: number | null;
}

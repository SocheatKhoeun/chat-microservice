import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { messages } from '../../../generated/prisma/client';
import { message_type } from '../../../generated/prisma/enums';

export class SendMessageDto {
  @ApiProperty({ description: 'The message content.', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    enum: message_type,
    description: 'Defaults to "text".',
  })
  @IsOptional()
  @IsEnum(message_type)
  type?: message_type;

  @ApiPropertyOptional({
    description: 'The hash of the message being replied to, if any.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replied_message_hash?: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description:
      'Return messages older than this message id (cursor-based pagination).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiPropertyOptional({
    description: 'Max number of messages to return.',
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RepliedMessageDto implements Pick<
  messages,
  'id' | 'hash' | 'sender_id' | 'type' | 'content' | 'created_at'
> {
  @ApiProperty({ description: 'The internal id of the message.' })
  id: number;

  @ApiPropertyOptional({
    description: 'The public hash of the message.',
    type: String,
    nullable: true,
  })
  hash: string | null;

  @ApiProperty({
    description: "The sender's unique identifier in the calling system.",
  })
  sender_id: string;

  @ApiProperty({ enum: message_type, nullable: true })
  type: message_type | null;

  @ApiPropertyOptional({
    description: 'The message content.',
    type: String,
    nullable: true,
  })
  content: string | null;

  @ApiProperty({ description: 'When the message was sent.' })
  created_at: Date;

  constructor(
    message: Pick<
      messages,
      'id' | 'hash' | 'sender_id' | 'type' | 'content' | 'created_at'
    >,
  ) {
    this.id = message.id;
    this.hash = message.hash;
    this.sender_id = message.sender_id;
    this.type = message.type;
    this.content = message.content;
    this.created_at = message.created_at;
  }
}

export class MessageResponseDto implements Pick<
  messages,
  | 'id'
  | 'hash'
  | 'conversation_id'
  | 'sender_id'
  | 'type'
  | 'content'
  | 'replied_message_id'
> {
  @ApiProperty({ description: 'The internal id of the message.' })
  id!: number;

  @ApiPropertyOptional({
    description: 'The public hash of the message.',
    type: String,
    nullable: true,
  })
  hash!: string | null;

  @ApiProperty({
    description: 'The internal id of the conversation the message belongs to.',
  })
  conversation_id!: number;

  @ApiProperty({
    description: "The sender's unique identifier in the calling system.",
  })
  sender_id!: string;

  @ApiProperty({ enum: message_type, nullable: true })
  type!: message_type | null;

  @ApiPropertyOptional({
    description: 'The message content.',
    type: String,
    nullable: true,
  })
  content!: string | null;

  @ApiPropertyOptional({
    description: 'The id of the message being replied to.',
    type: Number,
    nullable: true,
  })
  replied_message_id!: number | null;

  @ApiPropertyOptional({
    description: 'The message being replied to, if any.',
    type: RepliedMessageDto,
    nullable: true,
  })
  replied_message!: RepliedMessageDto | null;
}

export class MessageListResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data!: MessageResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` to fetch the next (older) page. Null when there are no more messages.',
    type: Number,
    nullable: true,
  })
  next_cursor!: number | null;
}

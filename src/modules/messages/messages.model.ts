import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  message_attachments,
  message_reactions,
  messages,
} from '../../../generated/prisma/client';
import { attachment_type, message_type } from '../../../generated/prisma/enums';

export class AttachmentInputDto {
  @ApiProperty({
    description:
      'URL of the already-uploaded file (this API stores metadata, not the file itself).',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  file_url!: string;

  @ApiProperty({ enum: attachment_type })
  @IsEnum(attachment_type)
  file_type!: attachment_type;
}

export class MessageAttachmentDto implements Pick<
  message_attachments,
  'id' | 'file_url' | 'file_type'
> {
  @ApiProperty({ description: 'The internal id of the attachment.' })
  id: number;

  @ApiProperty({ description: 'URL of the file.' })
  file_url: string;

  @ApiProperty({ description: 'The kind of file.' })
  file_type: string;

  constructor(
    attachment: Pick<message_attachments, 'id' | 'file_url' | 'file_type'>,
  ) {
    this.id = attachment.id;
    this.file_url = attachment.file_url;
    this.file_type = attachment.file_type;
  }
}

export class MessageReactionDto implements Pick<
  message_reactions,
  'user_id' | 'reaction' | 'created_at'
> {
  @ApiProperty({
    description: "The reacting user's unique identifier in the calling system.",
  })
  user_id: string;

  @ApiProperty({ description: 'The emoji/reaction.' })
  reaction: string;

  @ApiProperty({ description: 'When this reaction was set (or last changed).' })
  created_at: Date;

  constructor(
    reaction: Pick<message_reactions, 'user_id' | 'reaction' | 'created_at'>,
  ) {
    this.user_id = reaction.user_id;
    this.reaction = reaction.reaction;
    this.created_at = reaction.created_at;
  }
}

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

  @ApiPropertyOptional({
    description:
      'Media attachments for this message (already uploaded elsewhere; this just records the URLs).',
    type: [AttachmentInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}

export class ReactToMessageDto {
  @ApiProperty({
    description:
      'The emoji/reaction to apply. Replaces any existing reaction from you on this message.',
    maxLength: 32,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  reaction!: string;
}

export class EditMessageDto {
  @ApiProperty({ description: 'The new message content.', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}

export class ForwardMessageDto {
  @ApiProperty({
    description: 'Hash of the conversation to forward this message into.',
  })
  @IsString()
  @IsNotEmpty()
  target_conversation_hash!: string;
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

/**
 * What MessageResponseDto needs, from any of the shapes services build a
 * message out of: a full `messageInclude` row (relations always present,
 * possibly empty), or a bare `messages` row from a create() with no
 * `include` at all (relations simply absent — e.g. a conversation's opening
 * message can never have replies/attachments/reactions yet).
 */
type MessageInput = Pick<
  messages,
  | 'id'
  | 'hash'
  | 'conversation_id'
  | 'sender_id'
  | 'type'
  | 'content'
  | 'replied_message_id'
  | 'edited_at'
  | 'deleted_at'
> & {
  replied_message?: Pick<
    messages,
    'id' | 'hash' | 'sender_id' | 'type' | 'content' | 'created_at'
  > | null;
  attachments?: Pick<message_attachments, 'id' | 'file_url' | 'file_type'>[];
  reactions?: Pick<message_reactions, 'user_id' | 'reaction' | 'created_at'>[];
};

export class MessageResponseDto implements Pick<
  messages,
  | 'id'
  | 'hash'
  | 'conversation_id'
  | 'sender_id'
  | 'type'
  | 'content'
  | 'replied_message_id'
  | 'edited_at'
  | 'deleted_at'
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
    description: 'The internal id of the conversation the message belongs to.',
  })
  conversation_id: number;

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

  @ApiPropertyOptional({
    description: 'The id of the message being replied to.',
    type: Number,
    nullable: true,
  })
  replied_message_id: number | null;

  @ApiPropertyOptional({
    description: 'The message being replied to, if any.',
    type: RepliedMessageDto,
    nullable: true,
  })
  replied_message: RepliedMessageDto | null;

  @ApiPropertyOptional({
    description: 'When this message was last edited, if ever.',
    type: Date,
    nullable: true,
  })
  edited_at: Date | null;

  @ApiPropertyOptional({
    description:
      'When this message was deleted (unsent), if ever. `content` and `attachments` are cleared once set — render a placeholder instead.',
    type: Date,
    nullable: true,
  })
  deleted_at: Date | null;

  @ApiProperty({ type: [MessageAttachmentDto] })
  attachments: MessageAttachmentDto[];

  @ApiProperty({ type: [MessageReactionDto] })
  reactions: MessageReactionDto[];

  constructor(message: MessageInput) {
    this.id = message.id;
    this.hash = message.hash;
    this.conversation_id = message.conversation_id;
    this.sender_id = message.sender_id;
    this.type = message.type;
    this.content = message.content;
    this.replied_message_id = message.replied_message_id;
    this.replied_message = message.replied_message
      ? new RepliedMessageDto(message.replied_message)
      : null;
    this.edited_at = message.edited_at;
    this.deleted_at = message.deleted_at;
    this.attachments = (message.attachments ?? []).map(
      (attachment) => new MessageAttachmentDto(attachment),
    );
    this.reactions = (message.reactions ?? []).map(
      (reaction) => new MessageReactionDto(reaction),
    );
  }
}

export class MarkReadResultDto {
  @ApiProperty({ description: 'The conversation that was marked read.' })
  conversation_hash: string;

  @ApiProperty({
    description: 'How many previously-unread messages were marked read.',
  })
  read_count: number;

  @ApiPropertyOptional({
    description:
      'The id of the last message that was marked read, if any were.',
    type: Number,
    nullable: true,
  })
  last_read_message_id: number | null;

  constructor(result: {
    conversation_hash: string;
    read_count: number;
    last_read_message_id: number | null;
  }) {
    this.conversation_hash = result.conversation_hash;
    this.read_count = result.read_count;
    this.last_read_message_id = result.last_read_message_id;
  }
}

export class MessageListResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  data: MessageResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` to fetch the next (older) page. Null when there are no more messages.',
    type: Number,
    nullable: true,
  })
  next_cursor: number | null;

  constructor(input: {
    data: MessageResponseDto[];
    next_cursor: number | null;
  }) {
    this.data = input.data;
    this.next_cursor = input.next_cursor;
  }
}

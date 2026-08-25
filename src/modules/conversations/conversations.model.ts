import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  conversation_members,
  conversations,
  users,
} from '../../../generated/prisma/client';
import {
  conversation_member_role,
  conversation_type,
} from '../../../generated/prisma/enums';
import { MessageResponseDto } from '../messages/messages.model';

export class StartDirectConversationDto {
  @ApiProperty({
    description: "The other user's id.",
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  user_id!: string;

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
  id: number;

  @ApiProperty({ description: 'The public hash of the conversation.' })
  hash: string;

  @ApiProperty({ enum: conversation_type, nullable: true })
  type: conversation_type | null;

  @ApiPropertyOptional({
    description:
      "The other participant's id, nullable if their account has none.",
    type: String,
    nullable: true,
  })
  sender_id: string | null;

  @ApiProperty({
    description: 'The message that was just sent to start this conversation.',
    type: MessageResponseDto,
  })
  message: MessageResponseDto;

  @ApiProperty({ description: 'When the conversation was created.' })
  created_at: Date;

  @ApiProperty({ description: 'When the conversation was last updated.' })
  updated_at: Date;

  constructor(input: {
    id: number;
    hash: string;
    type: conversation_type | null;
    sender_id: string | null;
    message: ConstructorParameters<typeof MessageResponseDto>[0];
    created_at: Date;
    updated_at: Date;
  }) {
    this.id = input.id;
    this.hash = input.hash;
    this.type = input.type;
    this.sender_id = input.sender_id;
    this.message = new MessageResponseDto(input.message);
    this.created_at = input.created_at;
    this.updated_at = input.updated_at;
  }
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

  @ApiPropertyOptional({
    description:
      'List archived conversations instead of the normal (non-archived) inbox. Default false.',
    default: false,
  })
  @IsOptional()
  // Query strings arrive as "true"/"false" — `Boolean("false")` is `true`,
  // so a plain @Type(() => Boolean) would treat ?archived=false as truthy.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived?: boolean;
}

export class ConversationListItemDto implements Pick<
  conversations,
  'id' | 'hash' | 'type' | 'created_at' | 'updated_at'
> {
  @ApiProperty({ description: 'The internal id of the conversation.' })
  id: number;

  @ApiProperty({ description: 'The public hash of the conversation.' })
  hash: string;

  @ApiProperty({ enum: conversation_type, nullable: true })
  type: conversation_type | null;

  @ApiProperty({ description: 'When the conversation was created.' })
  created_at: Date;

  @ApiProperty({ description: 'When the conversation was last updated.' })
  updated_at: Date;

  @ApiPropertyOptional({
    description:
      "The other participant's id (direct conversations only), nullable if their account has none.",
    type: String,
    nullable: true,
  })
  sender_id: string | null;

  @ApiPropertyOptional({
    description: 'The most recent message in this conversation, if any.',
    type: MessageResponseDto,
    nullable: true,
  })
  last_message: MessageResponseDto | null;

  @ApiProperty({ description: "Whether you've muted this conversation." })
  is_muted: boolean;

  @ApiProperty({ description: "Whether you've archived this conversation." })
  is_archived: boolean;

  @ApiProperty({ description: "Whether you've pinned this conversation." })
  is_pinned: boolean;

  @ApiProperty({
    description: 'How many messages in this conversation you have not read.',
  })
  unread_count: number;

  constructor(input: {
    id: number;
    hash: string;
    type: conversation_type | null;
    created_at: Date;
    updated_at: Date;
    sender_id: string | null;
    last_message: ConstructorParameters<typeof MessageResponseDto>[0] | null;
    is_muted: boolean;
    is_archived: boolean;
    is_pinned: boolean;
    unread_count: number;
  }) {
    this.id = input.id;
    this.hash = input.hash;
    this.type = input.type;
    this.created_at = input.created_at;
    this.updated_at = input.updated_at;
    this.sender_id = input.sender_id;
    this.last_message = input.last_message
      ? new MessageResponseDto(input.last_message)
      : null;
    this.is_muted = input.is_muted;
    this.is_archived = input.is_archived;
    this.is_pinned = input.is_pinned;
    this.unread_count = input.unread_count;
  }
}

export class ConversationListResponseDto {
  @ApiProperty({ type: [ConversationListItemDto] })
  data: ConversationListItemDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` to fetch the next (older) page. Null when there are no more conversations.',
    type: Number,
    nullable: true,
  })
  next_cursor: number | null;

  @ApiProperty({
    description:
      'How many non-archived conversations have unread messages — the app-icon badge count, not a raw message tally.',
  })
  total_unread_conversations: number;

  constructor(input: {
    data: ConversationListItemDto[];
    next_cursor: number | null;
    total_unread_conversations: number;
  }) {
    this.data = input.data;
    this.next_cursor = input.next_cursor;
    this.total_unread_conversations = input.total_unread_conversations;
  }
}

export class UpdateConversationSettingsDto {
  @ApiPropertyOptional({ description: 'Mute or unmute this conversation.' })
  @IsOptional()
  @IsBoolean()
  is_muted?: boolean;

  @ApiPropertyOptional({
    description:
      'Archive or unarchive this conversation (hides it from the default inbox).',
  })
  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;

  @ApiPropertyOptional({
    description: 'Pin or unpin this conversation to the top of your inbox.',
  })
  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}

export class ConversationSettingsDto {
  @ApiProperty({ description: 'The conversation these settings apply to.' })
  conversation_hash: string;

  @ApiProperty()
  is_muted: boolean;

  @ApiProperty()
  is_archived: boolean;

  @ApiProperty()
  is_pinned: boolean;

  @ApiPropertyOptional({
    description: 'When this conversation was pinned, if it is.',
    type: Date,
    nullable: true,
  })
  pinned_at: Date | null;

  constructor(input: {
    conversation_hash: string;
    is_muted: boolean;
    is_archived: boolean;
    is_pinned: boolean;
    pinned_at: Date | null;
  }) {
    this.conversation_hash = input.conversation_hash;
    this.is_muted = input.is_muted;
    this.is_archived = input.is_archived;
    this.is_pinned = input.is_pinned;
    this.pinned_at = input.pinned_at;
  }
}

export class CreateGroupConversationDto {
  @ApiProperty({ description: 'The group name.', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'The group description.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'The group avatar URL.', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar_url?: string;

  @ApiProperty({
    description:
      "Other members' user ids to add at creation time (you are always added as owner).",
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(255)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  member_user_ids!: string[];
}

export class UpdateGroupDto {
  @ApiPropertyOptional({ description: 'The group name.', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'The group description.',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'The group avatar URL.', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar_url?: string;
}

export class AddGroupMembersDto {
  @ApiProperty({
    description: 'User ids of the members to add.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(255)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  member_user_ids!: string[];
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: conversation_member_role })
  @IsEnum(conversation_member_role)
  role!: conversation_member_role;
}

export class GroupMemberDto implements Pick<
  conversation_members,
  'user_id' | 'role' | 'nickname' | 'joined_at'
> {
  @ApiProperty({
    description: "The member's unique identifier in the calling system.",
  })
  user_id: string;

  @ApiProperty({ enum: conversation_member_role, nullable: true })
  role: conversation_member_role | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  nickname: string | null;

  @ApiProperty({ description: 'When they joined the conversation.' })
  joined_at: Date;

  @ApiPropertyOptional({
    description:
      'When they were last online, if known and not currently online. Null if never tracked (e.g. never gone offline yet) or unavailable for this response.',
    type: Date,
    nullable: true,
  })
  last_seen_at: Date | null;

  constructor(
    member: Pick<
      conversation_members,
      'user_id' | 'role' | 'nickname' | 'joined_at'
    > & { user?: Pick<users, 'last_seen_at'> | null },
  ) {
    this.user_id = member.user_id;
    this.role = member.role;
    this.nickname = member.nickname;
    this.joined_at = member.joined_at;
    this.last_seen_at = member.user?.last_seen_at ?? null;
  }
}

export class GroupMemberListResponseDto {
  @ApiProperty({ type: [GroupMemberDto] })
  data: GroupMemberDto[];

  constructor(data: GroupMemberDto[]) {
    this.data = data;
  }
}

/** A conversation_members row plus the one field GroupConversationResponseDto needs beyond what GroupMemberDto exposes: whether they've left. */
type GroupConversationMemberInput = Pick<
  conversation_members,
  'user_id' | 'role' | 'nickname' | 'joined_at' | 'left_at'
>;

export class GroupConversationResponseDto implements Pick<
  conversations,
  | 'id'
  | 'hash'
  | 'type'
  | 'name'
  | 'description'
  | 'avatar_url'
  | 'created_at'
  | 'updated_at'
> {
  @ApiProperty({ description: 'The internal id of the conversation.' })
  id: number;

  @ApiProperty({ description: 'The public hash of the conversation.' })
  hash: string;

  @ApiProperty({ enum: conversation_type, nullable: true })
  type: conversation_type | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatar_url: string | null;

  @ApiProperty({ description: 'When the conversation was created.' })
  created_at: Date;

  @ApiProperty({ description: 'When the conversation was last updated.' })
  updated_at: Date;

  @ApiProperty({ type: [GroupMemberDto] })
  members: GroupMemberDto[];

  constructor(
    conversation: Pick<
      conversations,
      | 'id'
      | 'hash'
      | 'type'
      | 'name'
      | 'description'
      | 'avatar_url'
      | 'created_at'
      | 'updated_at'
    > & { members: GroupConversationMemberInput[] },
  ) {
    this.id = conversation.id;
    this.hash = conversation.hash;
    this.type = conversation.type;
    this.name = conversation.name;
    this.description = conversation.description;
    this.avatar_url = conversation.avatar_url;
    this.created_at = conversation.created_at;
    this.updated_at = conversation.updated_at;
    // Only active members belong in the response — someone who left is no
    // longer a member, just a historical conversation_members row.
    this.members = conversation.members
      .filter((member) => !member.left_at)
      .map((member) => new GroupMemberDto(member));
  }
}

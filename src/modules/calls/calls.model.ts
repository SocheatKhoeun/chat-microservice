import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type {
  call_participants,
  calls,
} from '../../../generated/prisma/client';
import {
  call_participant_status,
  call_status,
  call_type,
} from '../../../generated/prisma/enums';

export class CallParticipantDto implements Pick<
  call_participants,
  'user_id' | 'status' | 'joined_at' | 'left_at'
> {
  @ApiProperty({
    description: "The participant's unique identifier in the calling system.",
  })
  user_id: string;

  @ApiProperty({
    enum: call_participant_status,
    nullable: true,
    description: 'invited, ringing, joined, left, rejected, or missed.',
  })
  status: call_participant_status | null;

  @ApiProperty({
    description:
      'When this participant was invited into the call — not necessarily when they actually joined; check `status` for that.',
  })
  joined_at: Date;

  @ApiPropertyOptional({
    description: 'When they left the call, if they did.',
    type: Date,
    nullable: true,
  })
  left_at: Date | null;

  constructor(
    participant: Pick<
      call_participants,
      'user_id' | 'status' | 'joined_at' | 'left_at'
    >,
  ) {
    this.user_id = participant.user_id;
    this.status = participant.status;
    this.joined_at = participant.joined_at;
    this.left_at = participant.left_at;
  }
}

export class CallResponseDto implements Pick<
  calls,
  | 'id'
  | 'hash'
  | 'conversation_id'
  | 'caller_id'
  | 'type'
  | 'status'
  | 'started_at'
  | 'answered_at'
  | 'ended_at'
> {
  @ApiProperty({ description: 'The internal id of the call.' })
  id: number;

  @ApiPropertyOptional({
    description: 'The public hash of the call.',
    type: String,
    nullable: true,
  })
  hash: string | null;

  @ApiProperty({
    description: 'The internal id of the conversation this call is in.',
  })
  conversation_id: number;

  @ApiProperty({
    description: "The caller's unique identifier in the calling system.",
  })
  caller_id: string;

  @ApiProperty({ enum: call_type, nullable: true })
  type: call_type | null;

  @ApiProperty({
    enum: call_status,
    nullable: true,
    description: 'ringing, active, ended, missed, rejected, or cancelled.',
  })
  status: call_status | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  started_at: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  answered_at: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  ended_at: Date | null;

  @ApiProperty({ type: [CallParticipantDto] })
  participants: CallParticipantDto[];

  constructor(
    call: Pick<
      calls,
      | 'id'
      | 'hash'
      | 'conversation_id'
      | 'caller_id'
      | 'type'
      | 'status'
      | 'started_at'
      | 'answered_at'
      | 'ended_at'
    > & {
      participants: Pick<
        call_participants,
        'user_id' | 'status' | 'joined_at' | 'left_at'
      >[];
    },
  ) {
    this.id = call.id;
    this.hash = call.hash;
    this.conversation_id = call.conversation_id;
    this.caller_id = call.caller_id;
    this.type = call.type;
    this.status = call.status;
    this.started_at = call.started_at;
    this.answered_at = call.answered_at;
    this.ended_at = call.ended_at;
    this.participants = call.participants.map(
      (participant) => new CallParticipantDto(participant),
    );
  }
}

export class ListCallsQueryDto {
  @ApiPropertyOptional({
    description:
      'Return calls older than this call id (cursor-based pagination).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @ApiPropertyOptional({
    description: 'Max number of calls to return.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CallListResponseDto {
  @ApiProperty({ type: [CallResponseDto] })
  data: CallResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as `cursor` to fetch the next (older) page. Null when there are no more calls.',
    type: Number,
    nullable: true,
  })
  next_cursor: number | null;

  constructor(input: { data: CallResponseDto[]; next_cursor: number | null }) {
    this.data = input.data;
    this.next_cursor = input.next_cursor;
  }
}

import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiProperty({ description: 'External user id requesting the messages (must be a participant).', example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  participant_id!: string;

  @ApiPropertyOptional({
    description: 'Id of the oldest message already fetched — returns messages older than this (for "load more").',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cursor?: number;

  @ApiPropertyOptional({ description: 'Messages per page.', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

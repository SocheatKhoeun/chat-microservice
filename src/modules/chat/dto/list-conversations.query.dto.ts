import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListConversationsQueryDto {
  @ApiProperty({ description: 'External user id whose conversations to list.', example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  participant_id!: string;

  @ApiPropertyOptional({ description: 'Page number, 1-indexed.', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Conversations per page.', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

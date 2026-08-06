import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MarkReadDto {
  @ApiProperty({ description: 'External user id marking the conversation as read.', example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  participant_id!: string;
}

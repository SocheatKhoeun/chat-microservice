import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'External user id of the sender (must be a participant).', example: 'user_123' })
  @IsString()
  @IsNotEmpty()
  sender_id!: string;

  @ApiProperty({ description: 'Message text.', example: 'Hey, is this still available?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}

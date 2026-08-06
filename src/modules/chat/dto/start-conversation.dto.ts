import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsString } from 'class-validator';

export class StartConversationDto {
  @ApiProperty({
    description:
      'Exactly two external user ids (owned by the calling project) that this 1:1 conversation is between.',
    example: ['user_123', 'user_456'],
    type: [String],
  })
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  participant_ids!: string[];
}

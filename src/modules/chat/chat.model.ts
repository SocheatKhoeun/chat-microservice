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
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { message_type } from '../../../generated/prisma/enums';
import { AttachmentInputDto } from '../messages/messages.model';

export class JoinConversationDto {
  @IsString()
  @IsNotEmpty()
  conversation_hash!: string;
}

export class MarkReadDto {
  @IsString()
  @IsNotEmpty()
  conversation_hash!: string;
}

export class TypingDto {
  @IsString()
  @IsNotEmpty()
  conversation_hash!: string;
}

export class WsSendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversation_hash!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsEnum(message_type)
  type?: message_type;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replied_message_hash?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentInputDto)
  attachments?: AttachmentInputDto[];
}

export class ListMessagesWsDto {
  @IsString()
  @IsNotEmpty()
  conversation_hash!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cursor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

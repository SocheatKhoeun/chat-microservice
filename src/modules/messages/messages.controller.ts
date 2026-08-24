import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import {
  EditMessageDto,
  ForwardMessageDto,
  ListMessagesQueryDto,
  MessageDeliveryDto,
  MessageListResponseDto,
  MessageReactionDto,
  MessageResponseDto,
  ReactToMessageDto,
  SendMessageDto,
} from './messages.model';
import { MessagesService } from './messages.service';

@ApiTags('Mobile - Messages')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/conversations')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':conversation_hash')
  @ApiOperation({ summary: 'List messages in a conversation (newest first).' })
  @ApiOkResponse({ type: MessageListResponseDto })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  listMessages(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messagesService.listMessages(
      req.user.id,
      conversationHash,
      query,
    );
  }

  @Post(':conversation_hash')
  @ApiOperation({ summary: 'Send a message in a conversation.' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  sendMessage(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(req.user.id, conversationHash, dto);
  }

  @Patch(':conversation_hash/:message_hash')
  @ApiOperation({ summary: 'Edit your own message.' })
  @ApiOkResponse({ type: MessageResponseDto })
  editMessage(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.editMessage(
      req.user.id,
      conversationHash,
      messageHash,
      dto,
    );
  }

  @Delete(':conversation_hash/:message_hash')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete (unsend) your own message.' })
  @ApiNoContentResponse()
  deleteMessage(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
  ) {
    return this.messagesService.deleteMessage(
      req.user.id,
      conversationHash,
      messageHash,
    );
  }

  @Post(':conversation_hash/:message_hash/forward')
  @ApiOperation({
    summary: 'Forward a message into another conversation you belong to.',
  })
  @ApiCreatedResponse({ type: MessageResponseDto })
  forwardMessage(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.messagesService.forwardMessage(
      req.user.id,
      conversationHash,
      messageHash,
      dto,
    );
  }

  @Post(':conversation_hash/:message_hash/delivered')
  @ApiOperation({
    summary:
      "Ack that this message reached you (Messenger's single-check ✓). Idempotent.",
  })
  @ApiOkResponse({ type: MessageDeliveryDto })
  markDelivered(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
  ) {
    return this.messagesService.markDelivered(
      req.user.id,
      conversationHash,
      messageHash,
    );
  }

  @Post(':conversation_hash/:message_hash/reactions')
  @ApiOperation({
    summary:
      'React to a message. Replaces any existing reaction from you on it.',
  })
  @ApiOkResponse({ type: MessageReactionDto })
  react(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
    @Body() dto: ReactToMessageDto,
  ) {
    return this.messagesService.reactToMessage(
      req.user.id,
      conversationHash,
      messageHash,
      dto,
    );
  }

  @Delete(':conversation_hash/:message_hash/reactions')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove your reaction from a message.' })
  @ApiNoContentResponse()
  unreact(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
  ) {
    return this.messagesService.removeReaction(
      req.user.id,
      conversationHash,
      messageHash,
    );
  }
}

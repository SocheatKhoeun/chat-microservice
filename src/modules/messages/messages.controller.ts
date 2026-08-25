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
  SearchMessagesQueryDto,
  SendMessageDto,
} from './messages.model';
import { MessagesService } from './messages.service';

@ApiTags('Mobile - Messages')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/conversations')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('search/messages')
  @ApiOperation({
    summary: 'Search message content across every conversation you belong to.',
  })
  @ApiOkResponse({ type: MessageListResponseDto })
  searchAllConversations(
    @Req() req: any,
    @Query() query: SearchMessagesQueryDto,
  ) {
    return this.messagesService.searchAllConversations(req.user.id, query);
  }

  @Get(':conversation_hash/search')
  @ApiOperation({
    summary: 'Search message content within one conversation.',
  })
  @ApiOkResponse({ type: MessageListResponseDto })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  searchInConversation(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Query() query: SearchMessagesQueryDto,
  ) {
    return this.messagesService.searchInConversation(
      req.user.id,
      conversationHash,
      query,
    );
  }

  @Get(':conversation_hash/pinned')
  @ApiOperation({
    summary:
      "List a conversation's pinned messages (most recently pinned first).",
  })
  @ApiOkResponse({ type: MessageListResponseDto })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  listPinned(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
  ) {
    return this.messagesService.listPinnedMessages(
      req.user.id,
      conversationHash,
    );
  }

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

  @Post(':conversation_hash/:message_hash/pin')
  @ApiOperation({
    summary:
      'Pin a message in its conversation. Any active member can pin/unpin.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  pin(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
  ) {
    return this.messagesService.pinMessage(
      req.user.id,
      conversationHash,
      messageHash,
    );
  }

  @Delete(':conversation_hash/:message_hash/pin')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unpin a message.' })
  @ApiNoContentResponse()
  unpin(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('message_hash') messageHash: string,
  ) {
    return this.messagesService.unpinMessage(
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

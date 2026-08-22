import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { ListMessagesQueryDto, MessageListResponseDto, MessageResponseDto, SendMessageDto } from './messages.model';
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
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientAuthGuard } from '../../common/guards/client-auth.guard';
import { CurrentClient } from '../../common/decorators/current-client.decorator';
import type { oauth_clients } from '../../../generated/prisma/client';
import { ChatService } from './chat.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';

@ApiTags('chat')
@ApiBasicAuth('client-credentials')
@UseGuards(ClientAuthGuard)
@Controller('chat/conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Get the 1:1 conversation between two participants, creating it if needed.' })
  startConversation(@CurrentClient() client: oauth_clients, @Body() dto: StartConversationDto) {
    return this.chatService.getOrCreateConversation(client.id, dto.participant_ids as [string, string]);
  }

  @Get()
  @ApiOperation({ summary: "List a participant's conversations, most recent activity first." })
  listConversations(@CurrentClient() client: oauth_clients, @Query() query: ListConversationsQueryDto) {
    return this.chatService.listConversations(client.id, query.participant_id, query.page!, query.limit!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one conversation (caller must be a participant).' })
  getConversation(
    @CurrentClient() client: oauth_clients,
    @Param('id', ParseIntPipe) id: number,
    @Query('participant_id') participantId: string,
  ) {
    return this.chatService.getConversation(client.id, id, participantId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message into a conversation (sender must be a participant).' })
  sendMessage(
    @CurrentClient() client: oauth_clients,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(client.id, id, dto.sender_id, dto.body);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages in a conversation, newest page first, oldest-first within the page.' })
  listMessages(
    @CurrentClient() client: oauth_clients,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chatService.listMessages(client.id, id, query.participant_id, query.cursor, query.limit!);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a conversation as read up to now, for one participant.' })
  markRead(
    @CurrentClient() client: oauth_clients,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markRead(client.id, id, dto.participant_id);
  }
}

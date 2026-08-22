import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import {
  ConversationListResponseDto,
  ConversationResponseDto,
  ListConversationsQueryDto,
  StartDirectConversationDto,
} from './conversations.model';
import { ConversationsService } from './conversations.service';

@ApiTags('Mobile - Conversations')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all conversations for the current user.' })
  @ApiOkResponse({ type: ConversationListResponseDto })
  listConversations(
    @Req() req: any,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.listConversations(req.user.id, query);
  }

  @Post('direct')
  @ApiOperation({
    summary: 'Start (or resume) a direct conversation with another user.',
  })
  @ApiCreatedResponse({ type: ConversationResponseDto })
  startDirectConversation(
    @Req() req: any,
    @Body() dto: StartDirectConversationDto,
  ) {
    return this.conversationsService.startDirectConversation(req.user.id, dto);
  }
}

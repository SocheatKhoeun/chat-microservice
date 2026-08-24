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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import {
  AddGroupMembersDto,
  ConversationListResponseDto,
  ConversationResponseDto,
  CreateGroupConversationDto,
  GroupConversationResponseDto,
  GroupMemberDto,
  GroupMemberListResponseDto,
  ListConversationsQueryDto,
  StartDirectConversationDto,
  UpdateGroupDto,
  UpdateMemberRoleDto,
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

  @Post('group')
  @ApiOperation({
    summary: 'Create a group conversation with an initial set of members.',
  })
  @ApiCreatedResponse({ type: GroupConversationResponseDto })
  createGroupConversation(
    @Req() req: any,
    @Body() dto: CreateGroupConversationDto,
  ) {
    return this.conversationsService.createGroupConversation(req.user.id, dto);
  }

  @Patch(':conversation_hash')
  @ApiOperation({
    summary:
      "Update a group's name, description, or avatar (owner/admin only).",
  })
  @ApiOkResponse({ type: GroupConversationResponseDto })
  updateGroup(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.conversationsService.updateGroupInfo(
      req.user.id,
      conversationHash,
      dto,
    );
  }

  @Get(':conversation_hash/members')
  @ApiOperation({ summary: 'List the members of a conversation.' })
  @ApiOkResponse({ type: GroupMemberListResponseDto })
  async listMembers(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
  ): Promise<GroupMemberListResponseDto> {
    const data = await this.conversationsService.listGroupMembers(
      req.user.id,
      conversationHash,
    );
    return new GroupMemberListResponseDto(data);
  }

  @Post(':conversation_hash/members')
  @ApiOperation({ summary: 'Add members to a group (owner/admin only).' })
  @ApiOkResponse({ type: GroupMemberListResponseDto })
  async addMembers(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Body() dto: AddGroupMembersDto,
  ): Promise<GroupMemberListResponseDto> {
    const data = await this.conversationsService.addGroupMembers(
      req.user.id,
      conversationHash,
      dto,
    );
    return new GroupMemberListResponseDto(data);
  }

  @Delete(':conversation_hash/members/:user_id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Remove a member from a group (owner/admin only), or leave it yourself by passing your own user id.',
  })
  @ApiNoContentResponse()
  removeMember(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('user_id') userId: string,
  ) {
    return this.conversationsService.removeGroupMember(
      req.user.id,
      conversationHash,
      userId,
    );
  }

  @Patch(':conversation_hash/members/:user_id')
  @ApiOperation({ summary: "Change a member's role (owner only)." })
  @ApiOkResponse({ type: GroupMemberDto })
  updateMemberRole(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Param('user_id') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.conversationsService.updateMemberRole(
      req.user.id,
      conversationHash,
      userId,
      dto,
    );
  }
}

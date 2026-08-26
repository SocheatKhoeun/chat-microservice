import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { CallListResponseDto, ListCallsQueryDto } from './calls.model';
import { CallsService } from './calls.service';

@ApiTags('Mobile - Calls')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('conversations/:conversation_hash')
  @ApiOperation({
    summary: 'List call history for a conversation (newest first).',
  })
  @ApiOkResponse({ type: CallListResponseDto })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  listCalls(
    @Req() req: any,
    @Param('conversation_hash') conversationHash: string,
    @Query() query: ListCallsQueryDto,
  ) {
    return this.callsService.listCalls(req.user.id, conversationHash, query);
  }

  @Get('active')
  @ApiOperation({
    summary: 'List every ringing/active call this user is still part of, across every conversation.',
  })
  @ApiOkResponse({ type: CallListResponseDto })
  listActiveCalls(@Req() req: any) {
    return this.callsService.listActiveCalls(req.user.id);
  }
}

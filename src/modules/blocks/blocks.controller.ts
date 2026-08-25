import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { BlockedUserDto, BlockedUserListResponseDto } from './blocks.model';
import { BlocksService } from './blocks.service';

@ApiTags('Mobile - Blocks')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/users')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get('blocked')
  @ApiOperation({ summary: 'List users you have blocked.' })
  @ApiOkResponse({ type: BlockedUserListResponseDto })
  listBlocked(@Req() req: any) {
    return this.blocksService.listBlockedUsers(req.user.id);
  }

  @Post(':user_id/block')
  @ApiOperation({
    summary:
      'Block a user — they can no longer start or send you direct messages.',
  })
  @ApiOkResponse({ type: BlockedUserDto })
  blockUser(@Req() req: any, @Param('user_id') userId: string) {
    return this.blocksService.blockUser(req.user.id, userId);
  }

  @Delete(':user_id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unblock a user.' })
  @ApiNoContentResponse()
  unblockUser(@Req() req: any, @Param('user_id') userId: string) {
    return this.blocksService.unblockUser(req.user.id, userId);
  }
}

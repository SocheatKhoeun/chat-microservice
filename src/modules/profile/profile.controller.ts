import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OauthJwtGuard } from 'src/common/guards/oauth-jwt/oauth-jwt.guard';
import { ProfileResponseDto } from './profile.model';
import { ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(OauthJwtGuard)
@Controller('v1/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async findProfileMe(@Req() req: any) {
    return this.profileService.getProfile(req.user.id);
  }
}

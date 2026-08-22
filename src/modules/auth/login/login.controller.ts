import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { oauth_clients } from '../../../../generated/prisma/client';
import { CurrentOauthClient } from 'src/common/decorators/oauth-client.decorator';
import { OauthGuard } from 'src/common/guards/oauth/oauth.guard';
import { AccessTokenResponseDto, LoginDto } from './login.model';
import { LoginService } from './login.service';

@ApiTags('Auth')
@ApiBasicAuth()
@UseGuards(OauthGuard)
@Controller('v1/auth')
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @Post('login')
  @ApiOperation({summary: 'Log in (or create) a user for the authenticated client.'})
  @ApiCreatedResponse({ type: AccessTokenResponseDto })
  login(@CurrentOauthClient() client: oauth_clients, @Body() dto: LoginDto) {
    return this.loginService.login(client.id, dto);
  }
}

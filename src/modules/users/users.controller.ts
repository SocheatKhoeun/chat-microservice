import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { oauth_clients } from '../../../generated/prisma/client';
import { CreateUserDto } from './users.model';
import { UsersService } from './users.service';
import { CurrentOauthClient } from 'src/common/decorators/oauth-client.decorator';
import { OauthGuard } from 'src/common/guards/oauth/oauth.guard';

@ApiTags('Users Registration')
@ApiBasicAuth()
@UseGuards(OauthGuard)
@Controller('v1/users/registration')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Store a user for the authenticated client.',
  })
  create(@CurrentOauthClient() client: oauth_clients, @Body() dto: CreateUserDto) {
    return this.usersService.create(client.id, dto);
  }
}

import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { OauthGuard } from 'src/common/guards/oauth/oauth.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, OauthGuard],
  exports: [UsersService],
})
export class UsersModule {}

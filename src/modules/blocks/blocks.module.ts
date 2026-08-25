import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatEventsModule } from '../../common/services/chat-events/chat-events.module';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [JwtModule.register({}), ChatEventsModule],
  controllers: [BlocksController],
  providers: [BlocksService, PrismaService, SettingService, OauthJwtGuard],
  exports: [BlocksService],
})
export class BlocksModule {}

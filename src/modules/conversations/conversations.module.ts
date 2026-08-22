import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatEventsModule } from '../../common/services/chat-events/chat-events.module';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [JwtModule.register({}), ChatEventsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    PrismaService,
    SettingService,
    OauthJwtGuard,
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}

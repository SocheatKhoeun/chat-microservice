import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { ChatEventsModule } from '../../common/services/chat-events/chat-events.module';
import { OauthJwtGuard } from '../../common/guards/oauth-jwt/oauth-jwt.guard';
import { ConversationsModule } from '../conversations/conversations.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [JwtModule.register({}), ConversationsModule, ChatEventsModule],
  controllers: [CallsController],
  providers: [CallsService, PrismaService, SettingService, OauthJwtGuard],
  exports: [CallsService],
})
export class CallsModule {}

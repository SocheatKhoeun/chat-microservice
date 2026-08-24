import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatEventsModule } from '../../common/services/chat-events/chat-events.module';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { CallsModule } from '../calls/calls.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    JwtModule.register({}),
    ConversationsModule,
    MessagesModule,
    CallsModule,
    ChatEventsModule,
  ],
  providers: [ChatGateway, PrismaService, SettingService],
})
export class ChatModule {}

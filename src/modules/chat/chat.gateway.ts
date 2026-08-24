import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { users } from '../../../generated/prisma/client';
import {
  DtoValidationError,
  validateDto,
} from '../../common/utils/validate-dto.util';
import {
  ChatEventsService,
  conversationRoom,
  userRoom,
} from '../../common/services/chat-events/chat-events.service';
import { PrismaService } from '../../core/services/prisma/prisma.service';
import { SettingService } from '../../core/services/setting/setting.service';
import type { AccessTokenPayload } from '../auth/login/login.model';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import {
  JoinConversationDto,
  ListMessagesWsDto,
  MarkReadDto,
  TypingDto,
  WsSendMessageDto,
} from './chat.model';

interface SocketData {
  user?: users;
  authenticated?: Promise<void>;
  /** conversation hashes this socket has an outstanding typing:start for, with no typing:stop yet */
  typingIn?: Set<string>;
}

type AuthenticatedSocket = Socket<any, any, any, SocketData>;

interface WsAck<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

const allowedOrigins = (process.env.ALLOW_CORS ?? 'http://localhost:5000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly onlineSocketCounts = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly settingService: SettingService,
    private readonly prismaService: PrismaService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly chatEventsService: ChatEventsService,
  ) {}

  afterInit(server: Server) {
    this.chatEventsService.setServer(server);
  }

  handleConnection(client: AuthenticatedSocket) {
    client.data.authenticated = this.authenticate(client);
  }

  private async authenticate(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('missing token');

      const secret = await this.settingService.getSecret();
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret },
      );

      const user = await this.prismaService.users.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.oauth_client_id !== payload.client_id)
        throw new Error('invalid token');

      client.data.user = user;
      await client.join(userRoom(user.id));
      await this.markOnline(user.id);
    } catch (error) {
      this.logger.warn(
        `WS authentication failed: ${error instanceof Error ? error.message : error}`,
      );
      client.emit('exception', {
        message: 'Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!',
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    // authenticate() may still be in flight when the socket disconnects (e.g. a fast
    // reconnect/navigation); wait for it so markOnline() can never fire after this.
    if (client.data.authenticated) await client.data.authenticated;

    const user = client.data.user;
    if (!user) return;

    this.logger.debug(`user ${user.id} disconnected`);

    for (const conversationHash of client.data.typingIn ?? []) {
      client.to(conversationRoom(conversationHash)).emit('typing:stop', {
        conversation_hash: conversationHash,
        user_id: user.id,
      });
    }

    await this.markOffline(user.id);
  }

  private async markOnline(userId: string): Promise<void> {
    const count = (this.onlineSocketCounts.get(userId) ?? 0) + 1;
    this.onlineSocketCounts.set(userId, count);
    if (count === 1) await this.broadcastPresence(userId, 'presence:online');
  }

  private async markOffline(userId: string): Promise<void> {
    const count = (this.onlineSocketCounts.get(userId) ?? 1) - 1;
    if (count <= 0) {
      this.onlineSocketCounts.delete(userId);

      // Best-effort: record "last seen" the moment they go fully offline (no
      // sockets left). A failure here shouldn't stop the presence broadcast.
      let lastSeenAt: Date | null = null;
      try {
        const updated = await this.prismaService.users.update({
          where: { id: userId },
          data: { last_seen_at: new Date() },
          select: { last_seen_at: true },
        });
        lastSeenAt = updated.last_seen_at;
      } catch (error) {
        this.logger.warn(
          `Failed to record last_seen_at for ${userId}: ${error instanceof Error ? error.message : error}`,
        );
      }

      await this.broadcastPresence(userId, 'presence:offline', lastSeenAt);
    } else {
      this.onlineSocketCounts.set(userId, count);
    }
  }

  private async broadcastPresence(
    userId: string,
    event: 'presence:online' | 'presence:offline',
    lastSeenAt?: Date | null,
  ): Promise<void> {
    const contactIds =
      await this.conversationsService.listContactUserIds(userId);
    this.chatEventsService.notifyUsers(contactIds, event, {
      user_id: userId,
      ...(lastSeenAt !== undefined ? { last_seen_at: lastSeenAt } : {}),
    });
  }

  @SubscribeMessage('conversation:join')
  async onJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck<{ conversation_hash: string }>> {
    return this.handle(client, async (user) => {
      const dto = await validateDto(JoinConversationDto, body);

      const conversation = await this.conversationsService.assertMembership(
        dto.conversation_hash,
        user.id,
      );

      await client.join(conversationRoom(conversation.hash));

      return { conversation_hash: conversation.hash };
    });
  }

  @SubscribeMessage('conversation:leave')
  async onLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck<{ conversation_hash: string }>> {
    return this.handle(client, async () => {
      const dto = await validateDto(JoinConversationDto, body);
      await client.leave(conversationRoom(dto.conversation_hash));
      return { conversation_hash: dto.conversation_hash };
    });
  }

  @SubscribeMessage('message:send')
  async onSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck> {
    return this.handle(client, async (user) => {
      const dto = await validateDto(WsSendMessageDto, body);

      const message = await this.messagesService.sendMessage(
        user.id,
        dto.conversation_hash,
        {
          content: dto.body,
          type: dto.type,
          replied_message_hash: dto.replied_message_hash,
          attachments: dto.attachments,
        },
      );

      await this.broadcastToConversation(
        dto.conversation_hash,
        'message:new',
        message,
      );

      return message;
    });
  }

  @SubscribeMessage('message:read')
  async onMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck> {
    return this.handle(client, async (user) => {
      const dto = await validateDto(MarkReadDto, body);

      const result = await this.messagesService.markConversationRead(
        user.id,
        dto.conversation_hash,
      );

      await this.broadcastToConversation(
        dto.conversation_hash,
        'message:read',
        {
          ...result,
          user_id: user.id,
          read_at: new Date().toISOString(),
        },
      );

      return result;
    });
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck<{ conversation_hash: string }>> {
    return this.emitTyping(client, body, 'typing:start');
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck<{ conversation_hash: string }>> {
    return this.emitTyping(client, body, 'typing:stop');
  }

  private async emitTyping(
    client: AuthenticatedSocket,
    body: unknown,
    event: 'typing:start' | 'typing:stop',
  ): Promise<WsAck<{ conversation_hash: string }>> {
    return this.handle(client, async (user) => {
      const dto = await validateDto(TypingDto, body);

      await this.conversationsService.assertMembership(
        dto.conversation_hash,
        user.id,
      );

      if (event === 'typing:start') {
        (client.data.typingIn ??= new Set()).add(dto.conversation_hash);
      } else {
        client.data.typingIn?.delete(dto.conversation_hash);
      }

      client.to(conversationRoom(dto.conversation_hash)).emit(event, {
        conversation_hash: dto.conversation_hash,
        user_id: user.id,
      });

      return { conversation_hash: dto.conversation_hash };
    });
  }

  @SubscribeMessage('list_messages')
  async onListMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<WsAck> {
    return this.handle(client, async (user) => {
      const dto = await validateDto(ListMessagesWsDto, body);

      return this.messagesService.listMessages(
        user.id,
        dto.conversation_hash,
        dto,
      );
    });
  }

  private async broadcastToConversation(
    conversationHash: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    const memberIds =
      await this.conversationsService.listMemberUserIds(conversationHash);

    this.chatEventsService.broadcastToConversation(
      conversationHash,
      memberIds,
      event,
      payload,
    );
  }

  private async handle<T>(
    client: AuthenticatedSocket,
    fn: (user: users) => Promise<T>,
  ): Promise<WsAck<T>> {
    try {
      if (client.data.authenticated) await client.data.authenticated;

      const user = client.data.user;
      if (!user)
        throw new UnauthorizedException(
          'Unauthorize access is not allowed||បាត់កូដសម្គាល់កម្មវិធី!',
        );

      const data = await fn(user);
      return { success: true, data };
    } catch (error) {
      if (error instanceof DtoValidationError)
        return { success: false, message: error.message };

      // HttpException (NotFound/Forbidden/BadRequest/Unauthorized/…) carries a
      // message that was deliberately written to be shown to the client.
      if (error instanceof HttpException)
        return { success: false, message: error.message };

      // Anything else (DB errors, etc.) is unexpected: log it server-side and
      // never forward its raw message to the client, which could leak internals.
      this.logger.error(
        `WS handler failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      return { success: false, message: 'Something went wrong!' };
    }
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      const [bearer, jwtToken] = authHeader.split(' ');
      if (bearer === 'Bearer' && jwtToken) return jwtToken;
    }

    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;

    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export function conversationRoom(conversationHash: string): string {
  return `conversation:${conversationHash}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

@Injectable()
export class ChatEventsService {
  private readonly logger = new Logger(ChatEventsService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  notifyUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  notifyUsers(userIds: string[], event: string, payload: unknown): void {
    if (userIds.length === 0) return;
    this.server?.to(userIds.map(userRoom)).emit(event, payload);
  }

  /**
   * Broadcasts to everyone currently in the conversation room, plus every member's
   * personal room — so a member who hasn't opened this conversation on this device
   * (and therefore never joined the room) still receives the event.
   */
  broadcastToConversation(
    conversationHash: string,
    memberIds: string[],
    event: string,
    payload: unknown,
  ): void {
    this.server
      ?.to([conversationRoom(conversationHash), ...memberIds.map(userRoom)])
      .emit(event, payload);
  }

  /**
   * A broadcast failure must never fail an otherwise-successful request — the
   * write already happened; the socket push is best-effort. Shared by every
   * service that broadcasts after a REST/WS mutation, so failure handling
   * (logging today, maybe metrics later) lives in exactly one place.
   */
  safeBroadcast(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      this.logger.warn(
        `Broadcast failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

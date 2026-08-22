import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class ChatEventsService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  notifyUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}

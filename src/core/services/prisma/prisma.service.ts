import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaClient } from '../../../../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

function stripQuotes(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor() {
    super({
      adapter: new PrismaMariaDb(stripQuotes(process.env.DATABASE_URL as string)),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onApplicationShutdown() {
    await this.$disconnect();
  }
}

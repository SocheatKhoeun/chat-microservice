import { int, mysqlEnum, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { conversations } from './conversations';
import { users } from './users';

export const calls = mysqlTable('calls', {
  id: int('id').autoincrement().primaryKey(),
  hash: varchar('hash', { length: 255 }).unique(),
  conversation_id: int('conversation_id')
    .notNull()
    .references(() => conversations.id),
  caller_id: varchar('caller_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  type: mysqlEnum('type', ['audio', 'video']),
  status: mysqlEnum('status', ['ringing', 'active', 'ended', 'missed', 'rejected', 'cancelled']),
  started_at: timestamp('started_at'),
  answered_at: timestamp('answered_at'),
  ended_at: timestamp('ended_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

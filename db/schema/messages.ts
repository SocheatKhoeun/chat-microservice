import {
  AnyMySqlColumn,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { conversations } from './conversations';
import { users } from './users';

export const messages = mysqlTable('messages', {
  id: int('id').autoincrement().primaryKey(),
  hash: varchar('hash', { length: 255 }).unique(),
  conversation_id: int('conversation_id')
    .notNull()
    .references(() => conversations.id),
  sender_id: varchar('sender_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  type: mysqlEnum('type', ['text', 'image', 'video', 'audio', 'file', 'system']),
  content: text('content'),
  replied_message_id: int('replied_message_id').references((): AnyMySqlColumn => messages.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

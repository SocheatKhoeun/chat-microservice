import { index, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { conversations } from './conversations';

export const messages = mysqlTable(
  'messages',
  {
    id: int('id').autoincrement().primaryKey(),
    conversation_id: int('conversation_id')
      .notNull()
      .references(() => conversations.id),
    // external user id of whoever sent the message
    sender_id: varchar('sender_id', { length: 191 }).notNull(),
    body: text('body').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index('messages_conversation_created_idx').on(table.conversation_id, table.created_at)],
);

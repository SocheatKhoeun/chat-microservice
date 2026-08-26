import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { messages } from './messages';

export const messageAttachments = mysqlTable('message_attachments', {
  id: int('id').autoincrement().primaryKey(),
  message_id: int('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  file_url: varchar('file_url', { length: 255 }).notNull(),
  file_type: varchar('file_type', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

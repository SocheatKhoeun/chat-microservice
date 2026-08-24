import {
  int,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { messages } from './messages';
import { users } from './users';

export const messageReads = mysqlTable(
  'message_reads',
  {
    id: int('id').autoincrement().primaryKey(),
    message_id: int('message_id')
      .notNull()
      .references(() => messages.id),
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id),
    read_at: timestamp('read_at').defaultNow().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [unique().on(table.message_id, table.user_id)],
);

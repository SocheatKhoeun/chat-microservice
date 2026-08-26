import {
  int,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { messages } from './messages';
import { users } from './users';

export const messageReactions = mysqlTable(
  'message_reactions',
  {
    id: int('id').autoincrement().primaryKey(),
    hash: varchar('hash', { length: 255 }).unique(),
    message_id: int('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id),
    reaction: varchar('reaction', { length: 255 }).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  // One reaction per user per message — reacting again replaces it (upsert).
  (table) => [unique().on(table.message_id, table.user_id)],
);

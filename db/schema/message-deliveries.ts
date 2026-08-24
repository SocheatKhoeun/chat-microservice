import {
  int,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { messages } from './messages';
import { users } from './users';

export const messageDeliveries = mysqlTable(
  'message_deliveries',
  {
    id: int('id').autoincrement().primaryKey(),
    message_id: int('message_id')
      .notNull()
      .references(() => messages.id),
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id),
    delivered_at: timestamp('delivered_at').defaultNow().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  // One delivery record per user per message — first ack wins.
  (table) => [unique().on(table.message_id, table.user_id)],
);

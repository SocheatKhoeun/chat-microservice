import {
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { conversations } from './conversations';
import { users } from './users';

export const conversationMembers = mysqlTable('conversation_members', {
  id: int('id').autoincrement().primaryKey(),
  conversation_id: int('conversation_id')
    .notNull()
    .references(() => conversations.id),
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  nickname: varchar('nickname', { length: 255 }),
  role: mysqlEnum('role', ['owner', 'admin', 'member']),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
  left_at: timestamp('left_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

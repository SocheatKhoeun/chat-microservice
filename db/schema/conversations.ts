import { int, mysqlEnum, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { users } from './users';

export const conversations = mysqlTable('conversations', {
  id: int('id').autoincrement().primaryKey(),
  hash: varchar('hash', { length: 255 }).notNull().unique(),
  type: mysqlEnum('type', ['direct', 'group']),
  name: varchar('name', { length: 255 }),
  description: varchar('description', { length: 255 }),
  avatar_url: varchar('avatar_url', { length: 255 }),
  created_by: varchar('created_by', { length: 255 }).references(() => users.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

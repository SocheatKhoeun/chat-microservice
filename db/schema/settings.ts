import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const settings = mysqlTable('settings', {
  id: int('id').autoincrement().primaryKey(),
  hash: varchar('hash', { length: 16 }).notNull(),
  key: varchar('key', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  description: varchar('description', { length: 255 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const oauthClientGrantTypes = mysqlTable('oauth_client_grant_types', {
  id: int('id').autoincrement().primaryKey(),
  username: varchar('username', { length: 191 }).notNull().unique(),
  description: varchar('description', { length: 191 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

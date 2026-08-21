import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { oauthClients } from './oauth-clients';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  external_id: varchar('external_id', { length: 255 }).unique(),
  oauth_client_id: int('oauth_client_id').references(() => oauthClients.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

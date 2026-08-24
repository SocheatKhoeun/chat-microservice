import { int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { oauthClients } from './oauth-clients';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  oauth_client_id: int('oauth_client_id').references(() => oauthClients.id),
  last_seen_at: timestamp('last_seen_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

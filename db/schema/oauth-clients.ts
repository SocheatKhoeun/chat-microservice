import { boolean, int, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { oauthClientGrantTypes } from './oauth-client-grant-types';

export const oauthClients = mysqlTable('oauth_clients', {
  id: int('id').autoincrement().primaryKey(),
  client_id: varchar('client_id', { length: 191 }).notNull().unique(),
  client_secret: varchar('client_secret', { length: 191 }).notNull(),
  grant_type_id: int('grant_type_id')
    .notNull()
    .references(() => oauthClientGrantTypes.id),
  is_disabled: boolean('is_disabled').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

import { index, int, mysqlTable, timestamp, unique, varchar } from 'drizzle-orm/mysql-core';
import { oauthClients } from './oauth-clients';

export const conversations = mysqlTable(
  'conversations',
  {
    id: int('id').autoincrement().primaryKey(),
    // owning integration (the calling project), so data from different
    // consumers of this microservice never mixes
    client_id: int('client_id')
      .notNull()
      .references(() => oauthClients.id),
    // external user ids, owned by the calling project — always stored with
    // participant_one_id < participant_two_id so a pair only ever maps to
    // one conversation regardless of call order
    participant_one_id: varchar('participant_one_id', { length: 191 }).notNull(),
    participant_two_id: varchar('participant_two_id', { length: 191 }).notNull(),
    participant_one_read_at: timestamp('participant_one_read_at'),
    participant_two_read_at: timestamp('participant_two_read_at'),
    last_message_at: timestamp('last_message_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    unique('conversations_client_participants_unique').on(
      table.client_id,
      table.participant_one_id,
      table.participant_two_id,
    ),
    index('conversations_participant_one_idx').on(table.client_id, table.participant_one_id),
    index('conversations_participant_two_idx').on(table.client_id, table.participant_two_id),
  ],
);

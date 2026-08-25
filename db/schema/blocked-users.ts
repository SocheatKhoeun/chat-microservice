import {
  int,
  mysqlTable,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { users } from './users';

// One user blocking another. Blocking is one-directional per row —
// blocker_id blocked blocked_id — checked both ways when gating direct
// messaging.
export const blockedUsers = mysqlTable(
  'blocked_users',
  {
    id: int('id').autoincrement().primaryKey(),
    blocker_id: varchar('blocker_id', { length: 255 })
      .notNull()
      .references(() => users.id),
    blocked_id: varchar('blocked_id', { length: 255 })
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  // A user can only block another user once — re-blocking is a no-op (upsert).
  (table) => [unique().on(table.blocker_id, table.blocked_id)],
);

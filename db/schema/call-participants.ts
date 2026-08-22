import { int, mysqlEnum, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { calls } from './calls';
import { users } from './users';

export const callParticipants = mysqlTable('call_participants', {
  id: int('id').autoincrement().primaryKey(),
  call_id: int('call_id')
    .notNull()
    .references(() => calls.id),
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
  left_at: timestamp('left_at'),
  status: mysqlEnum('status', ['invited', 'ringing', 'joined', 'left', 'rejected', 'missed']),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

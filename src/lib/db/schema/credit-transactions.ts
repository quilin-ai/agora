import { numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { billingSnapshots } from './billing-snapshots';
import { creditTransactionTypeEnum } from './enums';
import { discussions } from './discussions';
import { users } from './users';

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  discussionId: uuid('discussion_id').references(() => discussions.id),
  type: creditTransactionTypeEnum('type').notNull(),
  amountRaw: numeric('amount_raw', { precision: 20, scale: 8 }).notNull(),
  amountPlatform: numeric('amount_platform', { precision: 20, scale: 8 }).notNull(),
  billingSnapshotId: uuid('billing_snapshot_id')
    .notNull()
    .references(() => billingSnapshots.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

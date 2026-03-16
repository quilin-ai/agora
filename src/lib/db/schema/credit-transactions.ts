import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { billingSnapshots } from './billing-snapshots';
import { conversations } from './conversations';
import type { CreditTransactionTypeValue } from './enums';
import { users } from './users';

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').$type<CreditTransactionTypeValue>().notNull(),
  amount: numeric('amount', { precision: 10, scale: 4 }).notNull(),
  affectsBalance: boolean('affects_balance').notNull().default(true),
  balanceAfter: numeric('balance_after', { precision: 10, scale: 4 }).notNull(),
  rawCostRef: numeric('raw_cost_ref', { precision: 10, scale: 6 }),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  description: text('description'),
  stripePaymentId: text('stripe_payment_id'),
  idempotencyKey: text('idempotency_key').unique(),
  billingSnapshotId: uuid('billing_snapshot_id').references(() => billingSnapshots.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_credit_user').on(table.userId),
  index('idx_credit_created').on(table.createdAt.desc()),
]);

import { jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const billingSnapshots = pgTable('billing_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull(),
  pricingData: jsonb('pricing_data')
    .$type<Record<string, { input: number; output: number }>>()
    .notNull(),
  openrouterFee: numeric('openrouter_fee', { precision: 6, scale: 4 }).notNull(),
  platformMargin: numeric('platform_margin', { precision: 6, scale: 4 }).notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

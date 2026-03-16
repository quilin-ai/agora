import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull(),
  model: text('model').notNull().default('all'),
  mode: text('mode').notNull().default('all'),
  role: text('role').notNull().default('all'),
  roundType: text('round_type').notNull().default('all'),
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  abGroup: text('ab_group'),
  abTrafficPct: integer('ab_traffic_pct').default(100),
  usageCount: integer('usage_count').default(0),
  avgQuality: jsonb('avg_quality').$type<Record<string, number>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdBy: text('created_by').default('system'),
  notes: text('notes'),
}, (table) => [
  uniqueIndex('idx_prompt_active')
    .on(table.model, table.mode, table.role, table.roundType)
    .where(sql`${table.isActive} = true and ${table.abGroup} is null`),
]);

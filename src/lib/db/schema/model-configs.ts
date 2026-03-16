import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const modelConfigs = pgTable('model_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: text('model_id').notNull().unique(),
  displayName: text('display_name').notNull(),
  provider: text('provider').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

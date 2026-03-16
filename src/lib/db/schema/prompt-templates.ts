import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: text('version').notNull(),
  model: text('model').notNull(),
  mode: text('mode').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by'),
});

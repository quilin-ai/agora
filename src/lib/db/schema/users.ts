import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  balance: numeric('balance', { precision: 20, scale: 8 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

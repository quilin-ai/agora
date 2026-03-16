import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { conversationTypeEnum } from './enums';
import { users } from './users';

// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: conversationTypeEnum('type').notNull(),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';
import { messageRoleEnum } from './enums';

// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  modelId: text('model_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';
import { discussionStatusEnum } from './enums';

export const discussions = pgTable('discussions', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  status: discussionStatusEnum('status').notNull().default('created'),
  currentRound: integer('current_round').notNull().default(0),
  lastCompletedRound: integer('last_completed_round').notNull().default(0),
  topic: text('topic').notNull(),
  modelIds: jsonb('model_ids').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  abortedAt: timestamp('aborted_at', { withTimezone: true }),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  summary: jsonb('summary'),
});

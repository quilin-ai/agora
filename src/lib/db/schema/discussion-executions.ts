import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';
import type { ExecutionStatusValue } from './enums';

export const discussionExecutions = pgTable('discussion_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  attempt: integer('attempt').notNull().default(1),
  lockToken: text('lock_token').notNull(),
  status: text('status').$type<ExecutionStatusValue>().notNull(),
  errorMessage: text('error_message'),
  serverlessInstanceId: text('serverless_instance_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
}, (table) => [
  uniqueIndex('uq_execution').on(table.conversationId, table.attempt),
]);

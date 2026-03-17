import { boolean, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';
import type { FinishReasonValue, MessageRoleValue, MessageStatusValue, ModelErrorTypeValue } from './enums';
import { promptTemplates } from './prompt-templates';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').$type<MessageRoleValue>().notNull(),
  logicalModelId: text('logical_model_id'),
  actualModelId: text('actual_model_id'),
  round: integer('round'),
  anonymousLabel: text('anonymous_label'),
  content: text('content').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  rawCost: numeric('raw_cost', { precision: 10, scale: 6 }),
  status: text('status').$type<MessageStatusValue>().default('completed'),
  errorType: text('error_type').$type<ModelErrorTypeValue>(),
  errorMessage: text('error_message'),
  modelCallTraceId: text('model_call_trace_id'),
  roundTraceId: text('round_trace_id'),
  latencyMs: integer('latency_ms'),
  ttftMs: integer('ttft_ms'),
  finishReason: text('finish_reason').$type<FinishReasonValue>(),
  promptVersionId: uuid('prompt_version_id').references(() => promptTemplates.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  reaction: text('reaction'),
  isForkPoint: boolean('is_fork_point').default(false),
}, (table) => [
  index('idx_msg_conv').on(table.conversationId),
  index('idx_msg_conv_round').on(table.conversationId, table.round),
]);

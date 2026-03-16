import { sql } from 'drizzle-orm';
import { integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';
import type { RoundStatusValue, RoundTypeValue } from './enums';

interface ModelFailureRecord {
  logical_model_id: string;
  actual_model_id: string | null;
  error_type: string;
  action: 'retrying' | 'degraded' | 'skipped';
}

interface CompressedRoundState {
  round: number;
  model_positions: Array<{
    logical_model_id: string;
    core_stance: string;
    key_evidence: string[];
    challenged_by: string[];
    conceded_points: string[];
  }>;
  unresolved_conflicts: string[];
  new_information: string[];
  must_answer_in_next_round: string[];
}

export const discussionRounds = pgTable('discussion_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  status: text('status').$type<RoundStatusValue>().notNull(),
  completedModels: jsonb('completed_models').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  skippedModels: jsonb('skipped_models').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  failedModels: jsonb('failed_models')
    .$type<ModelFailureRecord[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  totalModels: integer('total_models').notNull(),
  compressedState: jsonb('compressed_state').$type<CompressedRoundState>(),
  roundRawCost: numeric('round_raw_cost', { precision: 10, scale: 6 }).default('0'),
  roundInputTokens: integer('round_input_tokens').default(0),
  roundOutputTokens: integer('round_output_tokens').default(0),
  roundTraceId: text('round_trace_id').notNull(),
  roundType: text('round_type').$type<RoundTypeValue>().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
}, (table) => [
  uniqueIndex('uq_round').on(table.conversationId, table.round),
]);

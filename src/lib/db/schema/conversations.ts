import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import type { DiscussionSummaryFinal } from '@/lib/types';

import type {
  ConversationTypeValue,
  DiscussionStatusValue,
  RiskLevelValue,
  VisibilityValue,
} from './enums';
import { billingSnapshots } from './billing-snapshots';
import { users } from './users';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<ConversationTypeValue>().notNull().default('chat'),
  mode: text('mode').default('consensus'),
  status: text('status').$type<DiscussionStatusValue>().notNull().default('created'),
  currentRound: integer('current_round').default(0),
  lastCompletedRound: integer('last_completed_round').default(0),
  idempotencyKey: text('idempotency_key'),
  executionLockToken: text('execution_lock_token'),
  executionLockAt: timestamp('execution_lock_at', { withTimezone: true }),
  executionStartedAt: timestamp('execution_started_at', { withTimezone: true }),
  abortRequestedAt: timestamp('abort_requested_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  abortedAt: timestamp('aborted_at', { withTimezone: true }),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  models: jsonb('models').$type<string[]>(),
  maxRounds: integer('max_rounds').default(3),
  title: text('title'),
  topic: text('topic'),
  topicHash: text('topic_hash'),
  summary: jsonb('summary').$type<DiscussionSummaryFinal>(),
  estimatedRawCost: numeric('estimated_raw_cost', { precision: 10, scale: 6 }).default('0'),
  heldPlatformAmount: numeric('held_platform_amount', { precision: 10, scale: 6 }).default('0'),
  totalRawCost: numeric('total_raw_cost', { precision: 10, scale: 6 }).default('0'),
  totalPlatformPrice: numeric('total_platform_price', { precision: 10, scale: 6 }).default('0'),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  billingSnapshotId: uuid('billing_snapshot_id').references(() => billingSnapshots.id),
  visibility: text('visibility').$type<VisibilityValue>().default('private'),
  shareSlug: text('share_slug').unique(),
  riskLevel: text('risk_level').$type<RiskLevelValue>().default('normal'),
  parentId: uuid('parent_id'),
  forkPointMessageId: uuid('fork_point_message_id'),
  forkInstruction: text('fork_instruction'),
  teamId: uuid('team_id'),
  qualityScore: jsonb('quality_score').$type<Record<string, unknown>>(),
  userRating: integer('user_rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: 'conversations_parent_id_fkey',
  }),
  uniqueIndex('uq_conv_idempotency').on(table.userId, table.idempotencyKey),
  index('idx_conv_user').on(table.userId),
  index('idx_conv_status').on(table.status),
  index('idx_conv_visibility').on(table.visibility).where(sql`${table.visibility} = 'public'`),
  index('idx_conv_created').on(table.createdAt.desc()),
  index('idx_conv_share').on(table.shareSlug).where(sql`${table.shareSlug} is not null`),
  index('idx_conv_user_topic_hash').on(table.userId, table.topicHash, table.createdAt.desc()),
]);

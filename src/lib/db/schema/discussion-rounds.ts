import { integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { discussions } from './discussions';
import { roundStatusEnum, roundTypeEnum } from './enums';

export const discussionRounds = pgTable('discussion_rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id),
  roundNumber: integer('round_number').notNull(),
  roundType: roundTypeEnum('round_type').notNull(),
  status: roundStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  modelResponses: jsonb('model_responses'),
});

import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { discussions } from './discussions';
import { executionStatusEnum } from './enums';

export const discussionExecutions = pgTable('discussion_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id),
  lockHolder: text('lock_holder').notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  status: executionStatusEnum('status').notNull().default('running'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
});

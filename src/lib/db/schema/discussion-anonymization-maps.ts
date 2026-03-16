import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { discussions } from './discussions';

export const discussionAnonymizationMaps = pgTable('discussion_anonymization_maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id),
  roundNumber: integer('round_number').notNull(),
  modelId: text('model_id').notNull(),
  anonymousLabel: text('anonymous_label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

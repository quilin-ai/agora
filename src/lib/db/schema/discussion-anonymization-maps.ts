import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { conversations } from './conversations';

export const discussionAnonymizationMaps = pgTable('discussion_anonymization_maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  label: text('label').notNull(),
  logicalModelId: text('logical_model_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('uq_anon_map').on(table.conversationId, table.round, table.label),
]);

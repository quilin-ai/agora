import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const byokKeys = pgTable('byok_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyHint: text('key_hint'),
  isValid: boolean('is_valid').default(true),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_byok_user').on(table.userId),
]);

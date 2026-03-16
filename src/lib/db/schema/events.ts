import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  eventName: text('event_name').notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  deviceFingerprint: text('device_fingerprint'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_events_name').on(table.eventName),
  index('idx_events_user').on(table.userId).where(sql`${table.userId} is not null`),
  index('idx_events_created').on(table.createdAt.desc()),
]);

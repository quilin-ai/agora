import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { discussions } from './discussions';
import { users } from './users';

// 注意：与 discussions 存在交叉引用，依赖 Drizzle 的惰性 references(() => ...) 避免循环
// GAP: 字段来源待确认 — 使用施工指令指定的最小字段集
export const billingSnapshots = pgTable('billing_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  discussionId: uuid('discussion_id').references(() => discussions.id),
  modelConfigs: jsonb('model_configs').notNull(),
  pricingSnapshot: jsonb('pricing_snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

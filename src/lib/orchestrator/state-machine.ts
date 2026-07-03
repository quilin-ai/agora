import { and, eq, inArray } from 'drizzle-orm';

import type { DiscussionStatus } from '@/lib/types';

import type { DiscussionStateStore, DiscussionStateUpdates } from './types';

/** 可以被 markFailed 收敛到 failed 的非终态。 */
const NON_TERMINAL_STATES: DiscussionStatus[] = ['created', 'streaming', 'summarizing'];

const ALLOWED_TRANSITIONS = new Set<string>([
  'created->streaming',
  'created->aborted',
  'created->failed',
  'streaming->streaming',
  'streaming->summarizing',
  'streaming->failed',
  'streaming->aborted',
  'summarizing->completed',
  'summarizing->failed',
]);

export function validateTransition(from: DiscussionStatus, to: DiscussionStatus): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}

export async function casTransition(params: {
  discussionId: string;
  from: DiscussionStatus;
  to: DiscussionStatus;
  updates?: DiscussionStateUpdates;
  store?: DiscussionStateStore;
}): Promise<boolean> {
  if (!validateTransition(params.from, params.to)) {
    throw new Error(`Invalid discussion transition: ${params.from} -> ${params.to}`);
  }

  const store = params.store ?? (await createDefaultDiscussionStateStore());

  return store.updateStatus({
    discussionId: params.discussionId,
    from: params.from,
    to: params.to,
    updates: params.updates,
  });
}

/**
 * 从任意非终态原子迁移到 failed（一条 UPDATE ... WHERE status IN (...)）。
 * 取代 handleFatalError 里依赖异常级联的三层 try/catch（CAS 落空只返回 false 不抛异常，级联是死代码）。
 */
export async function markFailed(params: {
  discussionId: string;
  updates?: DiscussionStateUpdates;
  store?: DiscussionStateStore;
}): Promise<boolean> {
  const store = params.store ?? (await createDefaultDiscussionStateStore());

  return store.markFailed({
    discussionId: params.discussionId,
    updates: params.updates,
  });
}

async function createDefaultDiscussionStateStore(): Promise<DiscussionStateStore> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async updateStatus({ discussionId, from, to, updates }) {
      const updateSet = {
        status: to,
        updatedAt: new Date(),
        ...(updates ?? {}),
      };

      const result = await db
        .update(schema.conversations)
        .set(updateSet)
        .where(
          and(eq(schema.conversations.id, discussionId), eq(schema.conversations.status, from))
        )
        .returning({ id: schema.conversations.id });

      return result.length > 0;
    },
    async markFailed({ discussionId, updates }) {
      const result = await db
        .update(schema.conversations)
        .set({
          status: 'failed',
          updatedAt: new Date(),
          ...(updates ?? {}),
        })
        .where(
          and(
            eq(schema.conversations.id, discussionId),
            inArray(schema.conversations.status, NON_TERMINAL_STATES)
          )
        )
        .returning({ id: schema.conversations.id });

      return result.length > 0;
    },
  };
}

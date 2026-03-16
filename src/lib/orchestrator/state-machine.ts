import { and, eq } from 'drizzle-orm';

import type { DiscussionStatus } from '@/lib/types';

import type { DiscussionStateStore, DiscussionStateUpdates } from './types';

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
  };
}

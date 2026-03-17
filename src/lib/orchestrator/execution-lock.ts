import { and, desc, eq, isNull, max } from 'drizzle-orm';

import type { ExecutionLockStore, LockReleaseInput } from './types';

export async function acquireLock(
  discussionId: string,
  lockHolder: string,
  store?: ExecutionLockStore
): Promise<boolean> {
  const resolvedStore = store ?? (await createDefaultExecutionLockStore());

  return resolvedStore.acquireLock(discussionId, lockHolder);
}

export async function releaseLock(
  discussionId: string,
  lockHolder: string,
  input?: LockReleaseInput,
  store?: ExecutionLockStore
): Promise<boolean> {
  const resolvedStore = store ?? (await createDefaultExecutionLockStore());

  return resolvedStore.releaseLock(discussionId, lockHolder, input);
}

async function createDefaultExecutionLockStore(): Promise<ExecutionLockStore> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async acquireLock(discussionId: string, lockHolder: string) {
      return db.transaction(async (tx) => {
        const lockedDiscussion = await tx
          .update(schema.conversations)
          .set({
            executionLockToken: lockHolder,
            executionLockAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.conversations.id, discussionId),
              eq(schema.conversations.status, 'created'),
              isNull(schema.conversations.executionLockToken)
            )
          )
          .returning({ id: schema.conversations.id });

        if (lockedDiscussion.length === 0) {
          return false;
        }

        const attempts = await tx
          .select({ maxAttempt: max(schema.discussionExecutions.attempt) })
          .from(schema.discussionExecutions)
          .where(eq(schema.discussionExecutions.conversationId, discussionId));

        const nextAttempt = Number(attempts[0]?.maxAttempt ?? 0) + 1;

        await tx.insert(schema.discussionExecutions).values({
          conversationId: discussionId,
          attempt: nextAttempt,
          lockToken: lockHolder,
          status: 'started',
        });

        return true;
      });
    },
    async releaseLock(discussionId: string, lockHolder: string, input?: LockReleaseInput) {
      return db.transaction(async (tx) => {
        const active = await tx
          .select({ id: schema.discussionExecutions.id })
          .from(schema.discussionExecutions)
          .where(
            and(
              eq(schema.discussionExecutions.conversationId, discussionId),
              eq(schema.discussionExecutions.lockToken, lockHolder),
              eq(schema.discussionExecutions.status, 'started'),
              isNull(schema.discussionExecutions.completedAt)
            )
          )
          .orderBy(desc(schema.discussionExecutions.startedAt))
          .limit(1);

        if (active.length === 0) {
          return false;
        }

        await tx
          .update(schema.conversations)
          .set({
            executionLockToken: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.conversations.id, discussionId),
              eq(schema.conversations.executionLockToken, lockHolder)
            )
          );

        await tx
          .update(schema.discussionExecutions)
          .set({
            completedAt: new Date(),
            status: input?.status ?? 'completed',
            errorMessage: input?.errorMessage ?? null,
          })
          .where(eq(schema.discussionExecutions.id, active[0].id));

        return true;
      });
    },
  };
}

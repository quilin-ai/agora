import { and, desc, eq, isNull, sql } from 'drizzle-orm';

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
        await tx.execute(
          sql`select ${schema.conversations.id} from ${schema.conversations} where ${schema.conversations.id} = ${discussionId} for update`
        );

        const active = await tx
          .select({ id: schema.discussionExecutions.id })
          .from(schema.discussionExecutions)
          .where(
            and(
              eq(schema.discussionExecutions.conversationId, discussionId),
              eq(schema.discussionExecutions.status, 'running'),
              isNull(schema.discussionExecutions.completedAt)
            )
          )
          .limit(1);

        if (active.length > 0) {
          return false;
        }

        await tx.insert(schema.discussionExecutions).values({
          conversationId: discussionId,
          lockToken: lockHolder,
          status: 'running',
        });

        return true;
      });
    },
    async releaseLock(discussionId: string, lockHolder: string, input?: LockReleaseInput) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select ${schema.conversations.id} from ${schema.conversations} where ${schema.conversations.id} = ${discussionId} for update`
        );

        const active = await tx
          .select({ id: schema.discussionExecutions.id })
          .from(schema.discussionExecutions)
          .where(
            and(
              eq(schema.discussionExecutions.conversationId, discussionId),
              eq(schema.discussionExecutions.lockToken, lockHolder),
              eq(schema.discussionExecutions.status, 'running'),
              isNull(schema.discussionExecutions.completedAt)
            )
          )
          .orderBy(desc(schema.discussionExecutions.startedAt))
          .limit(1);

        if (active.length === 0) {
          return false;
        }

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

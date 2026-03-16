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
          sql`select ${schema.discussions.id} from ${schema.discussions} where ${schema.discussions.id} = ${discussionId} for update`
        );

        const active = await tx
          .select({ id: schema.discussionExecutions.id })
          .from(schema.discussionExecutions)
          .where(
            and(
              eq(schema.discussionExecutions.discussionId, discussionId),
              eq(schema.discussionExecutions.status, 'running'),
              isNull(schema.discussionExecutions.releasedAt)
            )
          )
          .limit(1);

        if (active.length > 0) {
          return false;
        }

        await tx.insert(schema.discussionExecutions).values({
          discussionId,
          lockHolder,
          status: 'running',
        });

        return true;
      });
    },
    async releaseLock(discussionId: string, lockHolder: string, input?: LockReleaseInput) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select ${schema.discussions.id} from ${schema.discussions} where ${schema.discussions.id} = ${discussionId} for update`
        );

        const active = await tx
          .select({ id: schema.discussionExecutions.id })
          .from(schema.discussionExecutions)
          .where(
            and(
              eq(schema.discussionExecutions.discussionId, discussionId),
              eq(schema.discussionExecutions.lockHolder, lockHolder),
              eq(schema.discussionExecutions.status, 'running'),
              isNull(schema.discussionExecutions.releasedAt)
            )
          )
          .orderBy(desc(schema.discussionExecutions.lockedAt))
          .limit(1);

        if (active.length === 0) {
          return false;
        }

        await tx
          .update(schema.discussionExecutions)
          .set({
            releasedAt: new Date(),
            status: input?.status ?? 'completed',
            errorCode: input?.errorCode ?? null,
            errorMessage: input?.errorMessage ?? null,
          })
          .where(eq(schema.discussionExecutions.id, active[0].id));

        return true;
      });
    },
  };
}

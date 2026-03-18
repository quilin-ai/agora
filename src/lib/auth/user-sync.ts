import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

interface UpsertUserParams {
  email: string;
  name?: string;
  avatarUrl?: string;
  authProvider: string;
  authId?: string;
}

export async function createOrUpdateUser(params: UpsertUserParams) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, params.email))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(users)
      .set({
        name: params.name ?? existing[0].name,
        avatarUrl: params.avatarUrl ?? existing[0].avatarUrl,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.email, params.email))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: params.email,
      name: params.name,
      avatarUrl: params.avatarUrl,
      authProvider: params.authProvider,
      authId: params.authId,
      freeFrontierRemaining: 3,
      freeBudgetRemaining: 5,
    })
    .returning();
  return created;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

import { desc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import type { ApiErrorResponse } from '@/lib/types';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } } satisfies ApiErrorResponse,
      { status: 401 }
    );
  }

  const url = req.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    mode: r.mode ?? 'consensus',
    title: r.title ?? r.topic?.slice(0, 80) ?? '',
    status: r.status,
    models: (r.models as string[]) ?? [],
    visibility: r.visibility ?? 'private',
    total_platform_price: Number(r.totalPlatformPrice ?? 0),
    user_rating: r.userRating ?? 0,
    created_at: r.createdAt?.toISOString() ?? '',
    updated_at: r.updatedAt?.toISOString() ?? '',
  }));

  return Response.json({ items, total: items.length, page, limit });
}

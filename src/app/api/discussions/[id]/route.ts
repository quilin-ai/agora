import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import type { ApiErrorResponse, Conversation, Message } from '@/lib/types';

function mapConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    user_id: row.userId,
    type: row.type as Conversation['type'],
    mode: (row.mode ?? 'consensus') as Conversation['mode'],
    status: row.status as Conversation['status'],
    current_round: row.currentRound ?? 0,
    last_completed_round: row.lastCompletedRound ?? 0,
    models: (row.models as string[]) ?? [],
    max_rounds: row.maxRounds ?? 3,
    title: row.title ?? null,
    topic: row.topic ?? null,
    billing_snapshot_id: row.billingSnapshotId ?? null,
    summary: row.summary ?? null,
    visibility: (row.visibility ?? 'private') as Conversation['visibility'],
    share_slug: row.shareSlug ?? null,
    risk_level: (row.riskLevel ?? 'normal') as Conversation['risk_level'],
    total_platform_price: Number(row.totalPlatformPrice ?? 0),
    user_rating: row.userRating ?? null,
    created_at: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updated_at: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function mapMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    role: row.role as Message['role'],
    logical_model_id: row.logicalModelId ?? null,
    actual_model_id: row.actualModelId ?? null,
    round: row.round ?? null,
    anonymous_label: row.anonymousLabel ?? null,
    content: row.content,
    status: (row.status ?? 'completed') as Message['status'],
    error_type: row.errorType as Message['error_type'] ?? null,
    error_message: row.errorMessage ?? null,
    finish_reason: row.finishReason as Message['finish_reason'] ?? null,
    created_at: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } } satisfies ApiErrorResponse,
      { status: 401 }
    );
  }

  const discussionRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  const discussion = discussionRows[0];
  if (!discussion) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: '讨论不存在' } } satisfies ApiErrorResponse,
      { status: 404 }
    );
  }

  // 权限：本人或公开讨论
  if (discussion.userId !== session.user.id && discussion.visibility !== 'public') {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: '无权访问此讨论' } } satisfies ApiErrorResponse,
      { status: 403 }
    );
  }

  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  return Response.json({
    discussion: mapConversation(discussion),
    messages: messageRows.map(mapMessage),
  });
}

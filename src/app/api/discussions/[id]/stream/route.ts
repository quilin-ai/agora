import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import type { ActorContext, ApiErrorResponse, SSEEvent, Message } from '@/lib/types';
import { toRestoreEventData } from '@/lib/types';

function sseLine(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

async function getCompletedRoundMessages(discussionId: string, lastCompletedRound: number): Promise<Message[]> {
  if (lastCompletedRound <= 0) return [];
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, discussionId))
    .orderBy(messages.createdAt);

  return rows
    .filter((r) => r.round !== null && r.round <= lastCompletedRound)
    .map((r) => ({
      id: r.id,
      conversation_id: r.conversationId,
      role: r.role as Message['role'],
      logical_model_id: r.logicalModelId ?? null,
      actual_model_id: r.actualModelId ?? null,
      round: r.round ?? null,
      anonymous_label: r.anonymousLabel ?? null,
      content: r.content,
      status: (r.status ?? 'completed') as Message['status'],
      error_type: r.errorType as Message['error_type'] ?? null,
      error_message: r.errorMessage ?? null,
      finish_reason: r.finishReason as Message['finish_reason'] ?? null,
      created_at: r.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
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

  if (discussion.userId !== session.user.id && discussion.visibility !== 'public') {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: '无权访问此讨论' } } satisfies ApiErrorResponse,
      { status: 403 }
    );
  }

  const actor: ActorContext = { userId: session.user.id, source: 'web' };

  // 终态：直接返回 restore + done，关闭连接
  if (discussion.status === 'completed' || discussion.status === 'failed' || discussion.status === 'aborted') {
    const completedMessages = await getCompletedRoundMessages(id, discussion.lastCompletedRound ?? 0);
    const restoreData = toRestoreEventData({
      status: discussion.status as 'completed' | 'failed' | 'aborted',
      currentRound: discussion.currentRound ?? 0,
      lastCompletedRound: discussion.lastCompletedRound ?? 0,
      canStream: false,
      completedRoundMessages: completedMessages,
      summary: discussion.summary ?? null,
      errorCode: discussion.errorCode ?? undefined,
      errorMessage: discussion.errorMessage ?? undefined,
    });

    const body = sseLine({ type: 'restore', data: restoreData });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // 流式响应 + SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = async (event: SSEEvent) => {
    try {
      await writer.write(encoder.encode(sseLine(event)));
    } catch {
      // 连接已关闭
    }
  };

  const onEvent = (event: SSEEvent) => {
    void send(event);
  };

  // 启动或附加到讨论
  startOrAttachDiscussion({
    actor,
    discussionId: id,
    onEvent,
  })
    .then(async ({ role, discussion: attachedDiscussion, execution }) => {
      if (role === 'observer') {
        // 无法持锁：返回 restore(can_stream=false) 关闭连接
        const completedMessages = await getCompletedRoundMessages(id, attachedDiscussion.last_completed_round);
        const restoreData = toRestoreEventData({
          status: attachedDiscussion.status,
          currentRound: attachedDiscussion.current_round,
          lastCompletedRound: attachedDiscussion.last_completed_round,
          canStream: false,
          completedRoundMessages: completedMessages,
          summary: attachedDiscussion.summary ?? null,
        });
        await send({ type: 'restore', data: restoreData });
        await writer.close();
        return;
      }

      // owner 角色：onEvent 回调推送实时事件；必须 await orchestration，
      // 否则失败会变成 unhandled rejection 打崩进程，且流永不关闭。
      if (execution) {
        try {
          await execution;
        } catch (err) {
          const message = err instanceof Error ? err.message : '内部错误';
          await send({ type: 'error', data: { code: 'DISCUSSION_FAILED', message } });
        }
        await writer.close().catch(() => {});
      }
    })
    .catch(async (err) => {
      const message = err instanceof Error ? err.message : '内部错误';
      await send({ type: 'error', data: { code: 'DISCUSSION_FAILED', message } });
      await writer.close().catch(() => {});
    });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

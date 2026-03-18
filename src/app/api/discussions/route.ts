import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { hold, estimateRawCost, InsufficientCreditsError } from '@/lib/billing';
import { db } from '@/lib/db';
import { conversations, billingSnapshots } from '@/lib/db/schema';
import {
  validateTopicInput,
  validatePlanModelAccess,
  assertTopicHashNotDuplicated,
  RiskControlError,
} from '@/lib/security/risk-control';
import type { ApiErrorResponse } from '@/lib/types';

const CreateDiscussionSchema = z.object({
  topic: z.string().min(1).max(2000),
  models: z.array(z.string()).min(2).max(5).optional(),
  mode: z.literal('consensus').optional().default('consensus'),
  max_rounds: z.literal(3).optional().default(3),
  idempotency_key: z.string().min(1).max(128),
});

async function loadLatestBillingSnapshot() {
  const rows = await db
    .select()
    .from(billingSnapshots)
    .orderBy(billingSnapshots.effectiveFrom)
    .limit(1);
  return rows[0] ?? null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: '请先登录' } } satisfies ApiErrorResponse,
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: '请求体格式错误' } } satisfies ApiErrorResponse,
      { status: 400 }
    );
  }

  const parsed = CreateDiscussionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: '参数校验失败' } } satisfies ApiErrorResponse,
      { status: 400 }
    );
  }

  const { topic, models, mode, max_rounds, idempotency_key } = parsed.data;
  const userId = session.user.id;
  const defaultModels = (process.env.AGORA_DEFAULT_COUNCIL_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const resolvedModels = models ?? defaultModels;

  // 幂等检查
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.idempotencyKey, idempotency_key)))
    .limit(1);

  if (existing[0]) {
    return Response.json({
      id: existing[0].id,
      status: 'created',
      estimated_raw_cost: Number(existing[0].estimatedRawCost ?? 0),
      held_platform_amount: Number(existing[0].heldPlatformAmount ?? 0),
      stream_url: `/api/discussions/${existing[0].id}/stream`,
    });
  }

  // 话题校验（含注入检测）
  let topicHash: string;
  let riskLevel: string;
  try {
    const result = validateTopicInput({ topic, mode: 'council' });
    topicHash = result.topicHash;
    riskLevel = result.riskLevel;
  } catch (err) {
    if (err instanceof RiskControlError) {
      const code = err.code;
      const status = code === 'INJECTION_DETECTED' ? 400 : 400;
      return Response.json(
        { error: { code, message: err.message } } satisfies ApiErrorResponse,
        { status }
      );
    }
    throw err;
  }

  // 模型权限校验（budgetModels 对应 allowedModels 环境变量）
  try {
    validatePlanModelAccess({ plan: 'free', models: resolvedModels });
  } catch (err) {
    if (err instanceof RiskControlError) {
      return Response.json(
        { error: { code: err.code, message: err.message } } satisfies ApiErrorResponse,
        { status: err.code === 'MODEL_NOT_ALLOWED' ? 403 : 400 }
      );
    }
    throw err;
  }

  // 话题 hash 去重
  try {
    await assertTopicHashNotDuplicated({ userId, topicHash });
  } catch (err) {
    if (err instanceof RiskControlError) {
      return Response.json(
        { error: { code: err.code, message: err.message } } satisfies ApiErrorResponse,
        { status: 400 }
      );
    }
    throw err;
  }

  // 获取 billing snapshot
  const snapshot = await loadLatestBillingSnapshot();
  if (!snapshot) {
    return Response.json(
      { error: { code: 'INVALID_INPUT', message: '系统未配置定价信息，请联系管理员' } } satisfies ApiErrorResponse,
      { status: 503 }
    );
  }

  const pricingData = snapshot.pricingData as Record<string, { input: number; output: number }>;
  const estimatedRawCostValue = estimateRawCost({
    models: resolvedModels,
    maxRounds: max_rounds,
    pricingData,
  });

  const discussionId = randomUUID();

  // hold 积分
  let heldPlatformAmount: number;
  try {
    const holdResult = await hold(userId, discussionId, estimatedRawCostValue, snapshot.id);
    heldPlatformAmount = holdResult.heldPlatformAmount;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json(
        { error: { code: 'INSUFFICIENT_CREDITS', message: '积分不足，请充值后继续' } } satisfies ApiErrorResponse,
        { status: 402 }
      );
    }
    throw err;
  }

  await db.insert(conversations).values({
    id: discussionId,
    userId,
    type: 'council',
    mode,
    status: 'created',
    currentRound: 0,
    lastCompletedRound: 0,
    maxRounds: max_rounds,
    models: resolvedModels,
    title: topic.slice(0, 80),
    topic,
    topicHash,
    billingSnapshotId: snapshot.id,
    riskLevel: riskLevel as 'normal' | 'sensitive' | 'high_risk',
    estimatedRawCost: estimatedRawCostValue.toString(),
    heldPlatformAmount: heldPlatformAmount.toString(),
    idempotencyKey: idempotency_key,
    visibility: 'private',
  });

  return Response.json(
    {
      id: discussionId,
      status: 'created',
      estimated_raw_cost: estimatedRawCostValue,
      held_platform_amount: heldPlatformAmount,
      stream_url: `/api/discussions/${discussionId}/stream`,
    },
    { status: 201 }
  );
}

/**
 * 计费系统（CORE_SPEC §4 + 技术文档.md 第四章）
 *
 * 铁律：
 * 1. estimateRawCost() 只返回 raw_cost，不乘费率
 * 2. raw_cost → platform_price 只在 hold()/settle() 内执行一次
 * 3. 历史账单必须绑定 billing_snapshot_id
 *
 * 账本语义：
 * - hold    amount < 0, affects_balance = TRUE
 * - release amount > 0, affects_balance = TRUE
 * - refund  amount > 0, affects_balance = TRUE
 * - settle  amount = 0, affects_balance = FALSE
 */

import type { CreditTransactionType } from '@/lib/types';

// ─── 常量 ────────────────────────────────────────────────────────────────────

export const BILLING_CONSTANTS = {
  OPENROUTER_FEE: 1.055,
  PLATFORM_MARGIN: 1.15,
} as const;

/** 定价单位：pricingData 的 input/output 均为「每 1M token」价格。 */
export const PRICE_UNIT_DIVISOR = 1_000_000;

// ─── 错误 ────────────────────────────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';

  constructor(required: number, available: number) {
    super(
      `Insufficient credits: required ${required.toFixed(4)}, available ${available.toFixed(4)}`
    );
    this.name = 'InsufficientCreditsError';
  }
}

// ─── Store 接口（可注入，供测试 mock） ────────────────────────────────────────

export interface BillingTransactionRecord {
  type: CreditTransactionType;
  amount: number;
}

export interface BillingStore {
  getUserBalance(userId: string): Promise<number>;
  findTransaction(idempotencyKey: string): Promise<BillingTransactionRecord | null>;
  createTransaction(params: {
    userId: string;
    type: CreditTransactionType;
    amount: number;
    affectsBalance: boolean;
    balanceAfter: number;
    rawCostRef?: number;
    conversationId?: string;
    billingSnapshotId?: string;
    idempotencyKey: string;
  }): Promise<void>;
  updateUserBalance(userId: string, delta: number): Promise<void>;
}

// ─── 内部工具函数 ──────────────────────────────────────────────────────────────

/** raw_cost → platform_price（只允许在 hold/settle 内做一次；对外仅供结算落库读取） */
export function toPlatformPrice(rawCost: number): number {
  return Number(
    (rawCost * BILLING_CONSTANTS.OPENROUTER_FEE * BILLING_CONSTANTS.PLATFORM_MARGIN).toFixed(4)
  );
}

/**
 * 单次模型调用的 raw_cost（唯一的 per-1M 计价实现）。
 * pricingData 的 input/output 是每 1M token 价格，因此除以 PRICE_UNIT_DIVISOR。
 * billing.estimateRawCost 与 stream-hub 都复用此函数，避免单位漂移。
 */
export function rawCostForTokens(params: {
  inputTokens: number;
  outputTokens: number;
  pricing?: { input: number; output: number } | null;
}): number {
  if (!params.pricing) {
    return 0;
  }

  const inputCost = (params.inputTokens / PRICE_UNIT_DIVISOR) * params.pricing.input;
  const outputCost = (params.outputTokens / PRICE_UNIT_DIVISOR) * params.pricing.output;

  return Number((inputCost + outputCost).toFixed(6));
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 估算 raw_cost。
 * 永不在此函数内乘费率。
 */
export function estimateRawCost(params: {
  models: string[];
  maxRounds: number;
  pricingData: Record<string, { input: number; output: number }>;
  /** 每模型每轮估算输入 tokens（默认 2000） */
  estimatedInputTokensPerModel?: number;
  /** 每模型每轮估算输出 tokens（默认 500） */
  estimatedOutputTokensPerModel?: number;
}): number {
  const {
    models,
    maxRounds,
    pricingData,
    estimatedInputTokensPerModel = 2000,
    estimatedOutputTokensPerModel = 500,
  } = params;

  let rawCost = 0;

  for (const modelId of models) {
    rawCost +=
      rawCostForTokens({
        inputTokens: estimatedInputTokensPerModel,
        outputTokens: estimatedOutputTokensPerModel,
        pricing: pricingData[modelId],
      }) * maxRounds;
  }

  return Number(rawCost.toFixed(6));
}

/**
 * 冻结用户余额（hold）。
 * - amount < 0, affects_balance = TRUE
 * - 幂等：同 discussionId 第二次调用返回已有数据
 * - 余额不足时抛出 InsufficientCreditsError
 */
export async function hold(
  userId: string,
  discussionId: string,
  estimatedRawCost: number,
  billingSnapshotId: string,
  store?: BillingStore
): Promise<{ heldPlatformAmount: number }> {
  const billingStore = store ?? (await createDefaultBillingStore());
  const idempotencyKey = `hold:${discussionId}`;

  // 幂等校验
  const existing = await billingStore.findTransaction(idempotencyKey);
  if (existing) {
    return { heldPlatformAmount: Math.abs(existing.amount) };
  }

  const platformPrice = toPlatformPrice(estimatedRawCost);
  const currentBalance = await billingStore.getUserBalance(userId);

  if (currentBalance < platformPrice) {
    throw new InsufficientCreditsError(platformPrice, currentBalance);
  }

  const balanceAfter = Number((currentBalance - platformPrice).toFixed(4));

  await billingStore.createTransaction({
    userId,
    type: 'hold',
    amount: -platformPrice,
    affectsBalance: true,
    balanceAfter,
    rawCostRef: estimatedRawCost,
    conversationId: discussionId,
    billingSnapshotId,
    idempotencyKey,
  });

  await billingStore.updateUserBalance(userId, -platformPrice);

  return { heldPlatformAmount: platformPrice };
}

/**
 * 结算确认（settle）。
 * - amount = 0, affects_balance = FALSE
 * - 若 actualRawCost < 预估，先 release 差额，再写 settle 记录
 * - 幂等：同 discussionId 第二次调用直接返回
 */
export async function settle(
  userId: string,
  discussionId: string,
  actualRawCost: number,
  billingSnapshotId: string,
  store?: BillingStore
): Promise<void> {
  const billingStore = store ?? (await createDefaultBillingStore());
  const settleKey = `settle:${discussionId}`;

  // 幂等校验
  const existingSettle = await billingStore.findTransaction(settleKey);
  if (existingSettle) {
    return;
  }

  const actualPlatformPrice = toPlatformPrice(actualRawCost);
  const holdTransaction = await billingStore.findTransaction(`hold:${discussionId}`);

  if (holdTransaction) {
    const heldAmount = Math.abs(holdTransaction.amount);
    const excess = Number((heldAmount - actualPlatformPrice).toFixed(4));

    if (excess > 0) {
      // release 多余预占额度（内部 release，独立幂等键）
      const releaseKey = `settle-release:${discussionId}`;
      const existingRelease = await billingStore.findTransaction(releaseKey);
      if (!existingRelease) {
        const balanceBeforeRelease = await billingStore.getUserBalance(userId);
        const balanceAfterRelease = Number((balanceBeforeRelease + excess).toFixed(4));

        await billingStore.createTransaction({
          userId,
          type: 'release',
          amount: excess,
          affectsBalance: true,
          balanceAfter: balanceAfterRelease,
          conversationId: discussionId,
          billingSnapshotId,
          idempotencyKey: releaseKey,
        });

        await billingStore.updateUserBalance(userId, excess);
      }
    }
  }

  // settle 记录：amount = 0, affects_balance = FALSE
  const currentBalance = await billingStore.getUserBalance(userId);

  await billingStore.createTransaction({
    userId,
    type: 'settle',
    amount: 0,
    affectsBalance: false,
    balanceAfter: currentBalance,
    rawCostRef: actualRawCost,
    conversationId: discussionId,
    billingSnapshotId,
    idempotencyKey: settleKey,
  });
}

/**
 * 释放未消耗额度（release）。
 * - amount > 0, affects_balance = TRUE
 * - 幂等
 */
export async function release(
  userId: string,
  discussionId: string,
  amount: number,
  billingSnapshotId: string,
  store?: BillingStore
): Promise<void> {
  const billingStore = store ?? (await createDefaultBillingStore());
  const idempotencyKey = `release:${discussionId}`;

  const existing = await billingStore.findTransaction(idempotencyKey);
  if (existing) {
    return;
  }

  const currentBalance = await billingStore.getUserBalance(userId);
  const balanceAfter = Number((currentBalance + amount).toFixed(4));

  await billingStore.createTransaction({
    userId,
    type: 'release',
    amount,
    affectsBalance: true,
    balanceAfter,
    conversationId: discussionId,
    billingSnapshotId,
    idempotencyKey,
  });

  await billingStore.updateUserBalance(userId, amount);
}

/**
 * 异常退款（refund）。
 * - amount > 0, affects_balance = TRUE
 * - 幂等
 */
export async function refund(
  userId: string,
  discussionId: string,
  amount: number,
  billingSnapshotId: string,
  store?: BillingStore
): Promise<void> {
  const billingStore = store ?? (await createDefaultBillingStore());
  const idempotencyKey = `refund:${discussionId}`;

  const existing = await billingStore.findTransaction(idempotencyKey);
  if (existing) {
    return;
  }

  const currentBalance = await billingStore.getUserBalance(userId);
  const balanceAfter = Number((currentBalance + amount).toFixed(4));

  await billingStore.createTransaction({
    userId,
    type: 'refund',
    amount,
    affectsBalance: true,
    balanceAfter,
    conversationId: discussionId,
    billingSnapshotId,
    idempotencyKey,
  });

  await billingStore.updateUserBalance(userId, amount);
}

// ─── 默认 DB 实现 ──────────────────────────────────────────────────────────────

async function createDefaultBillingStore(): Promise<BillingStore> {
  const [{ db }, schema] = await Promise.all([
    import('@/lib/db/index'),
    import('@/lib/db/schema'),
  ]);

  const { eq } = await import('drizzle-orm');

  return {
    async getUserBalance(userId) {
      const rows = await db
        .select({ creditsBalance: schema.users.creditsBalance })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      return Number(rows[0]?.creditsBalance ?? 0);
    },

    async findTransaction(idempotencyKey) {
      const rows = await db
        .select({
          type: schema.creditTransactions.type,
          amount: schema.creditTransactions.amount,
        })
        .from(schema.creditTransactions)
        .where(eq(schema.creditTransactions.idempotencyKey, idempotencyKey))
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      return {
        type: row.type as CreditTransactionType,
        amount: Number(row.amount),
      };
    },

    async createTransaction(params) {
      await db.insert(schema.creditTransactions).values({
        userId: params.userId,
        type: params.type,
        amount: params.amount.toFixed(4),
        affectsBalance: params.affectsBalance,
        balanceAfter: params.balanceAfter.toFixed(4),
        rawCostRef: params.rawCostRef != null ? params.rawCostRef.toFixed(6) : null,
        conversationId: params.conversationId ?? null,
        billingSnapshotId: params.billingSnapshotId ?? null,
        idempotencyKey: params.idempotencyKey,
      });
    },

    async updateUserBalance(userId, delta) {
      const { sql } = await import('drizzle-orm');
      await db
        .update(schema.users)
        .set({
          creditsBalance: sql`${schema.users.creditsBalance} + ${delta.toFixed(4)}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    },
  };
}

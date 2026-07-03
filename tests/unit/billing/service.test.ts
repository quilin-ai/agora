/**
 * 计费系统单元测试
 * 覆盖：U05 / U06 / U07 / U08 / U09
 */

import { describe, expect, it } from 'vitest';

import {
  hold,
  settle,
  refund,
  estimateRawCost,
  InsufficientCreditsError,
  BILLING_CONSTANTS,
  type BillingStore,
  type BillingTransactionRecord,
} from '@/lib/billing';

// ─── 内存 Store 工厂 ───────────────────────────────────────────────────────────

interface MemoryStoreState {
  balance: number;
  transactions: Map<string, BillingTransactionRecord & { conversationId?: string }>;
}

function createMemoryStore(initialBalance: number): {
  store: BillingStore;
  state: MemoryStoreState;
} {
  const state: MemoryStoreState = {
    balance: initialBalance,
    transactions: new Map(),
  };

  const store: BillingStore = {
    async getUserBalance() {
      return state.balance;
    },
    async findTransaction(key) {
      return state.transactions.get(key) ?? null;
    },
    async createTransaction(params) {
      state.transactions.set(params.idempotencyKey, {
        type: params.type,
        amount: params.amount,
      });
    },
    async updateUserBalance(_userId, delta) {
      state.balance = Number((state.balance + delta).toFixed(4));
    },
  };

  return { store, state };
}

// ─── 辅助工具 ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-001';
const DISCUSSION_ID = 'disc-001';
const SNAPSHOT_ID = 'snap-001';

function platformPrice(rawCost: number): number {
  return Number(
    (rawCost * BILLING_CONSTANTS.OPENROUTER_FEE * BILLING_CONSTANTS.PLATFORM_MARGIN).toFixed(4)
  );
}

// ─── estimateRawCost ──────────────────────────────────────────────────────────

describe('estimateRawCost', () => {
  // pricingData 采用生产语义：input/output 为「每 1M token」价格（同 seed-phase-a1.ts）。
  const pricingData = {
    'openai/gpt-4': { input: 30, output: 60 },
    'anthropic/claude-3': { input: 15, output: 75 },
  };

  it('returns raw_cost as a number without applying fees', () => {
    const cost = estimateRawCost({
      models: ['openai/gpt-4'],
      maxRounds: 3,
      pricingData,
      estimatedInputTokensPerModel: 1000,
      estimatedOutputTokensPerModel: 200,
    });

    // per-1M: ((1000/1e6)*30 + (200/1e6)*60) * 3 = (0.03 + 0.012) * 3 = 0.126
    expect(cost).toBe(0.126);
    // 确认没有乘费率
    expect(cost).toBeLessThan(cost * BILLING_CONSTANTS.OPENROUTER_FEE);
  });

  it('sums across all models', () => {
    const cost = estimateRawCost({
      models: ['openai/gpt-4', 'anthropic/claude-3'],
      maxRounds: 1,
      pricingData,
      estimatedInputTokensPerModel: 1000,
      estimatedOutputTokensPerModel: 0,
    });

    // per-1M: (1000/1e6)*30 + (1000/1e6)*15 = 0.03 + 0.015 = 0.045
    expect(cost).toBe(0.045);
  });

  it('ignores models not present in pricingData', () => {
    const cost = estimateRawCost({
      models: ['unknown/model'],
      maxRounds: 3,
      pricingData,
    });

    expect(cost).toBe(0);
  });

  // 回归：用生产 seed 量级的定价，hold 金额必须落在合理区间（几美分），
  // 而不是因单位漂移 10^6 倍导致 InsufficientCredits / 天价 hold。
  it('keeps hold in a sane range with production seed-magnitude pricing', async () => {
    // 与 scripts/seed-phase-a1.ts 一致的每-1M 定价子集
    const seedPricing = {
      'anthropic/claude-opus-4.6': { input: 5.0, output: 25.0 },
      'openai/gpt-5.4': { input: 2.5, output: 15.0 },
      'google/gemini-3.1-pro': { input: 2.0, output: 12.0 },
    };

    const estimated = estimateRawCost({
      models: Object.keys(seedPricing),
      maxRounds: 3,
      pricingData: seedPricing,
    });

    // 默认 2000 in / 500 out per model per round，3 模型 3 轮 → 约 $0.135 raw cost
    expect(estimated).toBeGreaterThan(0);
    expect(estimated).toBeLessThan(1);

    const { store, state } = createMemoryStore(100);
    const { heldPlatformAmount } = await hold(USER_ID, DISCUSSION_ID, estimated, SNAPSHOT_ID, store);

    // platform_price = raw * 1.055 * 1.15，仍应是几毛钱量级，远小于 100 余额
    expect(heldPlatformAmount).toBe(platformPrice(estimated));
    expect(heldPlatformAmount).toBeGreaterThan(0);
    expect(heldPlatformAmount).toBeLessThan(1);
    expect(state.balance).toBeCloseTo(100 - heldPlatformAmount, 4);
  });
});

// ─── U05: hold — 余额充足 ──────────────────────────────────────────────────────

describe('U05 hold — 余额充足', () => {
  it('扣减 balance 并创建 hold 流水', async () => {
    const estimatedRawCost = 1.0;
    const expected = platformPrice(estimatedRawCost);
    const initialBalance = 100;

    const { store, state } = createMemoryStore(initialBalance);

    const result = await hold(USER_ID, DISCUSSION_ID, estimatedRawCost, SNAPSHOT_ID, store);

    // 返回正确的 heldPlatformAmount
    expect(result.heldPlatformAmount).toBe(expected);

    // balance 扣减
    expect(state.balance).toBeCloseTo(initialBalance - expected, 4);

    // 流水存在
    const tx = state.transactions.get(`hold:${DISCUSSION_ID}`);
    expect(tx).toBeDefined();
    expect(tx!.type).toBe('hold');
    expect(tx!.amount).toBe(-expected);
  });

  it('amount < 0（账本语义）', async () => {
    const { store, state } = createMemoryStore(50);

    await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);

    const tx = state.transactions.get(`hold:${DISCUSSION_ID}`);
    expect(tx!.amount).toBeLessThan(0);
  });
});

// ─── U06: hold — 余额不足 ─────────────────────────────────────────────────────

describe('U06 hold — 余额不足', () => {
  it('抛出 InsufficientCreditsError，余额不变', async () => {
    const { store, state } = createMemoryStore(0.001); // 极少余额

    await expect(hold(USER_ID, DISCUSSION_ID, 10.0, SNAPSHOT_ID, store)).rejects.toThrow(
      InsufficientCreditsError
    );

    await expect(hold(USER_ID, DISCUSSION_ID, 10.0, SNAPSHOT_ID, store)).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
    });

    // 余额未变
    expect(state.balance).toBe(0.001);

    // 无流水
    expect(state.transactions.has(`hold:${DISCUSSION_ID}`)).toBe(false);
  });

  it('InsufficientCreditsError 包含 code 字段', async () => {
    const { store } = createMemoryStore(0);

    try {
      await hold(USER_ID, DISCUSSION_ID, 5.0, SNAPSHOT_ID, store);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientCreditsError);
      expect((err as InsufficientCreditsError).code).toBe('INSUFFICIENT_CREDITS');
    }
  });
});

// ─── U07: settle — 实际 < 预估 ────────────────────────────────────────────────

describe('U07 settle — 实际 < 预估，release 差额 + settle(amount=0)', () => {
  it('creates release + settle transactions, restores excess to balance', async () => {
    const estimatedRawCost = 2.0;
    const actualRawCost = 1.0;

    const estimated = platformPrice(estimatedRawCost);
    const actual = platformPrice(actualRawCost);
    const excess = Number((estimated - actual).toFixed(4));

    const { store, state } = createMemoryStore(100);

    // 先 hold
    await hold(USER_ID, DISCUSSION_ID, estimatedRawCost, SNAPSHOT_ID, store);
    const balanceAfterHold = state.balance;

    // settle（实际 < 预估）
    await settle(USER_ID, DISCUSSION_ID, actualRawCost, SNAPSHOT_ID, store);

    // 检查 settle 流水：amount = 0, affects_balance = FALSE
    const settleTx = state.transactions.get(`settle:${DISCUSSION_ID}`);
    expect(settleTx).toBeDefined();
    expect(settleTx!.type).toBe('settle');
    expect(settleTx!.amount).toBe(0);

    // 检查 release 流水：amount = excess
    const releaseTx = state.transactions.get(`settle-release:${DISCUSSION_ID}`);
    expect(releaseTx).toBeDefined();
    expect(releaseTx!.type).toBe('release');
    expect(releaseTx!.amount).toBeCloseTo(excess, 4);

    // 余额恢复差额
    expect(state.balance).toBeCloseTo(balanceAfterHold + excess, 4);
  });

  it('settle amount=0（账本语义）', async () => {
    const { store, state } = createMemoryStore(50);

    await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);
    await settle(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);

    const settleTx = state.transactions.get(`settle:${DISCUSSION_ID}`);
    expect(settleTx!.amount).toBe(0);
  });
});

// ─── U08: settle — 幂等重试 ───────────────────────────────────────────────────

describe('U08 settle — 幂等重试：第二次无新流水', () => {
  it('second settle call creates no new transactions', async () => {
    const { store, state } = createMemoryStore(100);

    await hold(USER_ID, DISCUSSION_ID, 2.0, SNAPSHOT_ID, store);
    await settle(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);

    const countAfterFirst = state.transactions.size;
    const balanceAfterFirst = state.balance;

    // 第二次 settle
    await settle(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);

    expect(state.transactions.size).toBe(countAfterFirst);
    expect(state.balance).toBe(balanceAfterFirst);
  });
});

// ─── U09: refund — failed 退还 ───────────────────────────────────────────────

describe('U09 refund — failed 退还', () => {
  it('balance 恢复 + refund 流水', async () => {
    const estimatedRawCost = 1.5;
    const held = platformPrice(estimatedRawCost);

    const { store, state } = createMemoryStore(100);

    // hold 先扣
    await hold(USER_ID, DISCUSSION_ID, estimatedRawCost, SNAPSHOT_ID, store);
    const balanceAfterHold = state.balance;

    // refund 全部 held amount
    await refund(USER_ID, DISCUSSION_ID, held, SNAPSHOT_ID, store);

    // 余额恢复
    expect(state.balance).toBeCloseTo(balanceAfterHold + held, 4);

    // refund 流水
    const tx = state.transactions.get(`refund:${DISCUSSION_ID}`);
    expect(tx).toBeDefined();
    expect(tx!.type).toBe('refund');
    expect(tx!.amount).toBeCloseTo(held, 4);
  });

  it('refund amount > 0（账本语义）', async () => {
    const { store, state } = createMemoryStore(50);

    await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);
    await refund(USER_ID, DISCUSSION_ID, platformPrice(1.0), SNAPSHOT_ID, store);

    const tx = state.transactions.get(`refund:${DISCUSSION_ID}`);
    expect(tx!.amount).toBeGreaterThan(0);
  });

  it('refund 幂等：第二次调用无新流水', async () => {
    const { store, state } = createMemoryStore(100);

    await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);
    await refund(USER_ID, DISCUSSION_ID, platformPrice(1.0), SNAPSHOT_ID, store);

    const countAfter = state.transactions.size;
    const balanceAfter = state.balance;

    await refund(USER_ID, DISCUSSION_ID, platformPrice(1.0), SNAPSHOT_ID, store);

    expect(state.transactions.size).toBe(countAfter);
    expect(state.balance).toBe(balanceAfter);
  });
});

// ─── hold 幂等 ────────────────────────────────────────────────────────────────

describe('hold 幂等', () => {
  it('second hold returns existing amount without creating new transaction', async () => {
    const { store, state } = createMemoryStore(100);

    const first = await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);
    const countAfterFirst = state.transactions.size;
    const balanceAfterFirst = state.balance;

    const second = await hold(USER_ID, DISCUSSION_ID, 1.0, SNAPSHOT_ID, store);

    expect(second.heldPlatformAmount).toBe(first.heldPlatformAmount);
    expect(state.transactions.size).toBe(countAfterFirst);
    expect(state.balance).toBe(balanceAfterFirst);
  });
});

/**
 * POST /api/discussions 单元测试
 * 覆盖：
 * - 计费快照取「最新」(desc effectiveFrom)，而不是最老 (Fix 4)
 * - 使用真实 user.plan（而非硬编码 'free'）做模型权限校验 (Fix 6)
 * - plan 日限 (assertPlanDailyLimit) 接入并在超限时返回 429 (Fix 6)
 */

import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { billingSnapshots, conversations, users } from '@/lib/db/schema';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'user-1' } })),
}));

// db 是可变对象，测试逐条注入 select/insert 行为
vi.mock('@/lib/db', () => ({ db: {} }));

vi.mock('@/lib/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing')>();
  return {
    ...actual,
    hold: vi.fn(async () => ({ heldPlatformAmount: 0.16 })),
  };
});

vi.mock('@/lib/security/risk-control', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/risk-control')>();
  return {
    ...actual,
    assertTopicHashNotDuplicated: vi.fn(async () => undefined),
    countDiscussionsCreatedToday: vi.fn(async () => 0),
  };
});

import { db } from '@/lib/db';
import { countDiscussionsCreatedToday } from '@/lib/security/risk-control';
import { POST } from '@/app/api/discussions/route';

// ─── db 链式 mock ───────────────────────────────────────────────────────────────

const SNAPSHOT = {
  id: 'snap-1',
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  pricingData: {
    'anthropic/claude-opus-4.6': { input: 5.0, output: 25.0 },
    'openai/gpt-5.4': { input: 2.5, output: 15.0 },
    'anthropic/claude-haiku-4.5': { input: 1.0, output: 5.0 },
    'deepseek/deepseek-chat': { input: 0.28, output: 0.42 },
  },
};

interface DbOptions {
  plan: string;
  conversationRows?: unknown[];
  snapshotRows?: unknown[];
}

function installDb(opts: DbOptions): { orderByArgs: unknown[]; inserted: unknown[] } {
  const orderByArgs: unknown[] = [];
  const inserted: unknown[] = [];

  function chainFor(rows: unknown[]) {
    const chain = {
      where: () => chain,
      orderBy: (arg: unknown) => {
        orderByArgs.push(arg);
        return chain;
      },
      limit: async () => rows,
    };
    return chain;
  }

  Object.assign(db, {
    select: () => ({
      from: (table: unknown) => {
        if (table === conversations) return chainFor(opts.conversationRows ?? []);
        if (table === users) return chainFor([{ plan: opts.plan }]);
        if (table === billingSnapshots) return chainFor(opts.snapshotRows ?? [SNAPSHOT]);
        return chainFor([]);
      },
    }),
    insert: () => ({
      values: async (value: unknown) => {
        inserted.push(value);
      },
    }),
  });

  return { orderByArgs, inserted };
}

function makeRequest(body: unknown): NextRequest {
  return { async json() { return body; } } as unknown as NextRequest;
}

function orderByChunkValues(args: unknown[]): string[] {
  return args.flatMap((arg) => {
    const chunks = (arg as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
    return chunks.flatMap((chunk) => {
      const value = chunk?.value;
      return Array.isArray(value) ? (value as string[]) : [];
    });
  });
}

// ─── tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/discussions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(countDiscussionsCreatedToday).mockResolvedValue(0);
  });

  it('Fix4 — loads the latest billing snapshot by desc(effectiveFrom) and creates the discussion', async () => {
    const { orderByArgs, inserted } = installDb({ plan: 'pro' });

    const res = await POST(
      makeRequest({
        topic: 'Should a small AI startup ship a CLI first?',
        models: ['anthropic/claude-opus-4.6', 'openai/gpt-5.4'],
        idempotency_key: 'idem-1',
      })
    );

    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);

    const chunks = orderByChunkValues(orderByArgs);
    expect(chunks.some((v) => v.includes('desc'))).toBe(true);
    expect(chunks.some((v) => v.includes('asc'))).toBe(false);
  });

  it('Fix6 — reads the real user plan (pro allows a frontier model that free would reject)', async () => {
    installDb({ plan: 'pro' });

    // 'anthropic/claude-opus-4.6' 不是 budget 模型；若仍硬编码 plan:'free' 会 403。
    const res = await POST(
      makeRequest({
        topic: 'Evaluate a frontier-only council',
        models: ['anthropic/claude-opus-4.6', 'openai/gpt-5.4'],
        idempotency_key: 'idem-2',
      })
    );

    expect(res.status).toBe(201);
  });

  it('Fix6 — free user with a frontier model is rejected 403 (plan actually enforced)', async () => {
    installDb({ plan: 'free' });

    const res = await POST(
      makeRequest({
        topic: 'Free tier frontier attempt',
        models: ['anthropic/claude-opus-4.6', 'openai/gpt-5.4'],
        idempotency_key: 'idem-3',
      })
    );

    expect(res.status).toBe(403);
  });

  it('Fix6 — enforces the plan daily council limit with 429', async () => {
    installDb({ plan: 'free' });
    // free councilPerDay = 1；今日已用 1 → 超限
    vi.mocked(countDiscussionsCreatedToday).mockResolvedValue(1);

    const res = await POST(
      makeRequest({
        topic: 'Second free council of the day',
        models: ['anthropic/claude-haiku-4.5', 'deepseek/deepseek-chat'],
        idempotency_key: 'idem-4',
      })
    );

    expect(res.status).toBe(429);
    const bodyJson = (await res.json()) as { error: { code: string } };
    expect(bodyJson.error.code).toBe('RATE_LIMITED');
  });
});

import { createHash } from 'node:crypto';

import { and, desc, eq, gte, sql } from 'drizzle-orm';

import type { DiscussionStatus } from '@/lib/types';

export type RiskLevel = 'normal' | 'sensitive' | 'high_risk';
export type UserPlan = 'free' | 'pro' | 'pro_max' | 'ultra';
export type DiscussionMode = 'chat' | 'council';

export const PLAN_LIMITS = {
  free: { chatPerDay: 20, councilPerDay: 1, maxModels: 3, tier: 'budget' },
  pro: { chatPerDay: 500, councilPerDay: 50, maxModels: 5, tier: 'all' },
  pro_max: { chatPerDay: 2000, councilPerDay: 200, maxModels: 10, tier: 'all' },
  ultra: { chatPerDay: -1, councilPerDay: -1, maxModels: 10, tier: 'all' },
} as const;

export const BUDGET_MODELS = [
  'openai/gpt-5-mini',
  'google/gemini-3-flash',
  'deepseek/deepseek-chat',
  'x-ai/grok-4.1',
  'anthropic/claude-haiku-4.5',
] as const;

export const INPUT_LIMITS = {
  chatCharacters: 16_000,
  councilCharacters: 8_000,
  duplicateWindowMs: 24 * 60 * 60 * 1000,
} as const;

const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
const WHITESPACE_PATTERN = /\s+/g;
const MARKDOWN_NOISE_PATTERN = /(^|\s)[#>*_`~-]{1,3}(?=\s|$)/g;

const INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?previous\s+instructions?\b/i,
  /\bignore\s+(the\s+)?system\s+prompt\b/i,
  /\breveal\s+(the\s+)?system\s+prompt\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /<\s*system\s*>/i,
  /\bdo\s+anything\s+now\b/i,
] as const;

const HIGH_RISK_PATTERNS = [
  /\bself[-\s]?harm\b/i,
  /\bsuicide\b/i,
  /\bkill\b/i,
  /\bweapon\b/i,
  /\bexplosive\b/i,
  /\bmalware\b/i,
  /\bransomware\b/i,
  /\bexploit\b/i,
  /\bssn\b/i,
  /\bcredit\s*card\b/i,
] as const;

const SENSITIVE_PATTERNS = [
  /\bmedical\b/i,
  /\blegal\b/i,
  /\bfinancial\b/i,
  /\binvestment\b/i,
  /\btax\b/i,
  /\bdiagnosis\b/i,
] as const;

export class RiskControlError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RiskControlError';
  }
}

export interface TopicHashStore {
  hasRecentTopicHash(params: {
    userId: string;
    topicHash: string;
    since: Date;
  }): Promise<boolean>;
  getRecentTopicHashMatch?(params: {
    userId: string;
    topicHash: string;
    since: Date;
  }): Promise<RecentTopicHashMatch | null>;
}

export interface RecentTopicHashMatch {
  discussionId: string;
  status: DiscussionStatus;
  title: string | null;
  topic: string | null;
  createdAt: Date;
}

export function normalizeTopic(topic: string): string {
  return topic
    .normalize('NFKC')
    .replace(ZERO_WIDTH_PATTERN, '')
    .replace(MARKDOWN_NOISE_PATTERN, ' ')
    .trim()
    .toLowerCase()
    .replace(WHITESPACE_PATTERN, ' ');
}

export function createTopicHash(topic: string): string {
  return createHash('sha256').update(normalizeTopic(topic)).digest('hex');
}

export function classifyRiskLevel(topic: string): RiskLevel {
  const normalized = normalizeTopic(topic);

  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'high_risk';
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'sensitive';
  }

  return 'normal';
}

export function detectInjectionPattern(topic: string): boolean {
  const normalized = normalizeTopic(topic);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function validateTopicInput(params: {
  topic: string;
  mode: DiscussionMode;
}): { normalizedTopic: string; topicHash: string; riskLevel: RiskLevel } {
  const normalizedTopic = normalizeTopic(params.topic);

  if (!normalizedTopic) {
    throw new RiskControlError('INVALID_INPUT', 'Topic must not be empty');
  }

  const maxCharacters =
    params.mode === 'council' ? INPUT_LIMITS.councilCharacters : INPUT_LIMITS.chatCharacters;

  if (normalizedTopic.length > maxCharacters) {
    throw new RiskControlError(
      'INVALID_INPUT',
      `Topic exceeds the ${params.mode} length limit`
    );
  }

  if (detectInjectionPattern(normalizedTopic)) {
    throw new RiskControlError('INJECTION_DETECTED', 'Topic contains prompt injection patterns');
  }

  return {
    normalizedTopic,
    topicHash: createTopicHash(normalizedTopic),
    riskLevel: classifyRiskLevel(normalizedTopic),
  };
}

export function assertPlanDailyLimit(params: {
  plan: UserPlan;
  mode: DiscussionMode;
  usedToday: number;
}): void {
  const planLimits = PLAN_LIMITS[params.plan];
  const limit =
    params.mode === 'council' ? planLimits.councilPerDay : planLimits.chatPerDay;

  if (limit >= 0 && params.usedToday >= limit) {
    throw new RiskControlError(
      'RATE_LIMITED',
      `${params.plan} plan has reached the daily ${params.mode} limit`
    );
  }
}

/**
 * I09 / I10 — 验证用户 plan 对模型的访问权限
 * - MODEL_NOT_ALLOWED: free tier 用户使用了非 budget 模型
 * - MAX_MODELS_EXCEEDED: 请求模型数超出 plan 上限
 */
export function validatePlanModelAccess(params: {
  plan: UserPlan;
  models: string[];
  budgetModels?: readonly string[];
}): void {
  const planLimits = PLAN_LIMITS[params.plan];
  const allowedBudgetModels = params.budgetModels ?? BUDGET_MODELS;

  if (params.models.length > planLimits.maxModels) {
    throw new RiskControlError(
      'MAX_MODELS_EXCEEDED',
      `${params.plan} plan allows at most ${planLimits.maxModels} council models, got ${params.models.length}`
    );
  }

  if (planLimits.tier === 'budget') {
    for (const model of params.models) {
      const isBudgetModel =
        allowedBudgetModels.includes(model as (typeof BUDGET_MODELS)[number]) ||
        model.endsWith(':free');
      if (!isBudgetModel) {
        throw new RiskControlError(
          'MODEL_NOT_ALLOWED',
          `${params.plan} plan does not allow frontier model: ${model}`
        );
      }
    }
  }
}

export async function assertTopicHashNotDuplicated(params: {
  userId: string;
  topicHash: string;
  store?: TopicHashStore;
  now?: () => Date;
}): Promise<void> {
  const store = params.store ?? (await createDefaultTopicHashStore());
  const now = params.now ?? (() => new Date());
  const since = new Date(now().getTime() - INPUT_LIMITS.duplicateWindowMs);
  const exists = await store.hasRecentTopicHash({
    userId: params.userId,
    topicHash: params.topicHash,
    since,
  });

  if (exists) {
    throw new RiskControlError(
      'INVALID_INPUT',
      'A substantially identical topic was already submitted in the last 24 hours'
    );
  }
}

export async function findRecentTopicHashMatch(params: {
  userId: string;
  topicHash: string;
  store?: TopicHashStore;
  now?: () => Date;
}): Promise<RecentTopicHashMatch | null> {
  const store = params.store ?? (await createDefaultTopicHashStore());
  const now = params.now ?? (() => new Date());
  const since = new Date(now().getTime() - INPUT_LIMITS.duplicateWindowMs);

  if (store.getRecentTopicHashMatch) {
    return store.getRecentTopicHashMatch({
      userId: params.userId,
      topicHash: params.topicHash,
      since,
    });
  }

  const exists = await store.hasRecentTopicHash({
    userId: params.userId,
    topicHash: params.topicHash,
    since,
  });

  return exists
    ? {
        discussionId: 'unknown',
        status: 'created',
        title: null,
        topic: null,
        createdAt: since,
      }
    : null;
}

export function shouldEnforceTopicDedup(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const override = env.AGORA_DISABLE_TOPIC_DEDUP?.trim().toLowerCase();
  if (override === '1' || override === 'true' || override === 'yes') {
    return false;
  }

  return env.AGORA_RUNTIME_ENV !== 'test';
}

async function createDefaultTopicHashStore(): Promise<TopicHashStore> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async hasRecentTopicHash({ userId, topicHash, since }) {
      const rows = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.userId, userId),
            eq(schema.conversations.topicHash, topicHash),
            gte(schema.conversations.createdAt, since)
          )
        )
        .orderBy(desc(schema.conversations.createdAt))
        .limit(1);

      return rows.length > 0;
    },
    async getRecentTopicHashMatch({ userId, topicHash, since }) {
      const rows = await db
        .select({
          discussionId: schema.conversations.id,
          status: schema.conversations.status,
          title: schema.conversations.title,
          topic: schema.conversations.topic,
          createdAt: schema.conversations.createdAt,
        })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.userId, userId),
            eq(schema.conversations.topicHash, topicHash),
            gte(schema.conversations.createdAt, since)
          )
        )
        .orderBy(desc(schema.conversations.createdAt))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        discussionId: row.discussionId,
        status: row.status,
        title: row.title ?? null,
        topic: row.topic ?? null,
        createdAt: row.createdAt ?? new Date(),
      };
    },
  };
}

export async function countDiscussionsCreatedToday(params: {
  userId: string;
  mode: DiscussionMode;
  now?: () => Date;
}): Promise<number> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const now = params.now ?? (() => new Date());
  const since = new Date(now().getTime() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.userId, params.userId),
        eq(schema.conversations.type, params.mode),
        gte(schema.conversations.createdAt, since)
      )
    );

  return Number(rows[0]?.count ?? 0);
}

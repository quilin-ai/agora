import { eq } from 'drizzle-orm';

import type {
  ActorContext,
  Conversation,
  DiscussionMode,
  DiscussionStatus,
  SSEEvent,
  Visibility,
} from '@/lib/types';

import { acquireLock } from './execution-lock';
import { runConsensusDiscussion } from './consensus';
import type { BillingResolver, ExecutionLockStore } from './types';

export interface SessionStarterRepository {
  getDiscussion(discussionId: string): Promise<Conversation | null>;
}

export interface StartedDiscussionSession {
  role: 'owner' | 'observer';
  discussion: Conversation;
  execution: Promise<void> | null;
}

export async function startOrAttachDiscussion(params: {
  actor: ActorContext;
  discussionId: string;
  onEvent: (event: SSEEvent) => void;
  repository?: SessionStarterRepository;
  lockStore?: ExecutionLockStore;
  runner?: typeof runConsensusDiscussion;
}): Promise<StartedDiscussionSession> {
  const repository = params.repository ?? (await createDefaultSessionStarterRepository());
  const runner = params.runner ?? runConsensusDiscussion;
  const discussion = await repository.getDiscussion(params.discussionId);

  if (!discussion) {
    throw new Error(`Discussion ${params.discussionId} was not found`);
  }

  if (discussion.status === 'created') {
    const lockHolder = `${params.actor.source}:${params.actor.userId}`;
    const lockAcquired = await acquireLock(discussion.id, lockHolder, params.lockStore);

    if (lockAcquired) {
      assertRunnableDiscussionState(discussion);

      const execution = runner({
        discussionId: discussion.id,
        actor: params.actor,
        onEvent: params.onEvent,
        lockStore: params.lockStore,
        lockAlreadyAcquired: true,
        // 仅 Web 路径接入计费结算；CLI/test 保持零计费（fallback 到 createZeroBillingResolver）。
        billingResolver:
          params.actor.source === 'web'
            ? createDiscussionBillingResolver(discussion.id)
            : undefined,
      });

      return { role: 'owner', discussion, execution };
    }
  }

  return { role: 'observer', discussion, execution: null };
}

async function createDefaultSessionStarterRepository(): Promise<SessionStarterRepository> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async getDiscussion(discussionId) {
      const rows = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, discussionId))
        .limit(1);

      const discussion = rows[0];
      if (!discussion) {
        return null;
      }

      return mapConversationRecord({
        id: discussion.id,
        userId: discussion.userId,
        type: discussion.type,
        mode: discussion.mode ?? 'consensus',
        status: discussion.status,
        currentRound: discussion.currentRound ?? 0,
        lastCompletedRound: discussion.lastCompletedRound ?? 0,
        models: discussion.models ?? [],
        title: discussion.title ?? null,
        topic: discussion.topic ?? null,
        billingSnapshotId: discussion.billingSnapshotId ?? null,
        summary: discussion.summary ?? null,
        visibility: discussion.visibility ?? 'private',
        shareSlug: discussion.shareSlug ?? null,
        totalPlatformPrice: discussion.totalPlatformPrice ?? '0',
        userRating: discussion.userRating ?? null,
        createdAt: discussion.createdAt ?? new Date(),
        updatedAt: discussion.updatedAt ?? new Date(),
      });
    },
  };
}

function mapConversationRecord(record: {
  id: string;
  userId: string;
  type: string;
  mode: string;
  status: DiscussionStatus;
  currentRound: number;
  lastCompletedRound: number;
  models: string[];
  title: string | null;
  topic: string | null;
  billingSnapshotId: string | null;
  summary: Conversation['summary'];
  visibility: Visibility;
  shareSlug: string | null;
  totalPlatformPrice: string | number;
  userRating: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Conversation {
  return {
    id: record.id,
    user_id: record.userId,
    type: record.type as Conversation['type'],
    mode: record.mode as DiscussionMode,
    status: record.status,
    current_round: record.currentRound,
    last_completed_round: record.lastCompletedRound,
    models: record.models,
    title: record.title,
    topic: record.topic,
    billing_snapshot_id: record.billingSnapshotId,
    summary: record.summary,
    visibility: record.visibility,
    share_slug: record.shareSlug,
    total_platform_price: Number(record.totalPlatformPrice),
    user_rating: record.userRating,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function assertRunnableDiscussionState(discussion: Conversation): void {
  if (!discussion.topic?.trim() || discussion.models.length === 0 || !discussion.billing_snapshot_id) {
    throw new Error('INVALID_DISCUSSION_STATE');
  }
}

/**
 * Web 路径的真实计费解析器：
 * - resolveForDiscussion：读取 conversations 已聚合的 total_raw_cost / total_platform_price 供 done 事件使用
 * - settle：用真实 raw_cost 结算，并把 total_platform_price 落库（此前全仓无写入方）
 * - release：讨论失败时释放已冻结的预占额度
 * 全程惰性 import，保证纯启动逻辑（如注入 runner 的单测）不触碰数据库。
 */
function createDiscussionBillingResolver(discussionId: string): BillingResolver {
  async function loadContext(): Promise<{
    userId: string;
    billingSnapshotId: string | null;
    totalRawCost: number;
    totalPlatformPrice: number;
    heldPlatformAmount: number;
  } | null> {
    const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
    const rows = await db
      .select({
        userId: schema.conversations.userId,
        billingSnapshotId: schema.conversations.billingSnapshotId,
        totalRawCost: schema.conversations.totalRawCost,
        totalPlatformPrice: schema.conversations.totalPlatformPrice,
        heldPlatformAmount: schema.conversations.heldPlatformAmount,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, discussionId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      userId: row.userId,
      billingSnapshotId: row.billingSnapshotId,
      totalRawCost: Number(row.totalRawCost ?? 0),
      totalPlatformPrice: Number(row.totalPlatformPrice ?? 0),
      heldPlatformAmount: Number(row.heldPlatformAmount ?? 0),
    };
  }

  return {
    async resolveForDiscussion() {
      const ctx = await loadContext();
      return {
        raw_cost: ctx?.totalRawCost ?? 0,
        platform_price: ctx?.totalPlatformPrice ?? 0,
      };
    },
    async settle() {
      const ctx = await loadContext();
      if (!ctx?.billingSnapshotId) {
        return;
      }

      const { settle, toPlatformPrice } = await import('@/lib/billing');
      await settle(ctx.userId, discussionId, ctx.totalRawCost, ctx.billingSnapshotId);

      const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
      await db
        .update(schema.conversations)
        .set({
          totalPlatformPrice: toPlatformPrice(ctx.totalRawCost).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(schema.conversations.id, discussionId));
    },
    async release() {
      const ctx = await loadContext();
      if (!ctx?.billingSnapshotId || ctx.heldPlatformAmount <= 0) {
        return;
      }

      const { release } = await import('@/lib/billing');
      await release(ctx.userId, discussionId, ctx.heldPlatformAmount, ctx.billingSnapshotId);
    },
  };
}

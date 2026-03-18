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
import type { ExecutionLockStore } from './types';

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

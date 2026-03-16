import { describe, expect, it, vi } from 'vitest';

import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import type { Conversation } from '@/lib/types';

function createDiscussion(status: Conversation['status']): Conversation {
  return {
    id: 'd1',
    user_id: 'u1',
    type: 'council',
    mode: 'consensus',
    status,
    current_round: status === 'created' ? 0 : 1,
    last_completed_round: 0,
    models: ['m1', 'm2'],
    title: 'A discussion',
    topic: 'Topic',
    summary: null,
    visibility: 'private',
    share_slug: null,
    total_platform_price: 0,
    user_rating: null,
    created_at: '2026-03-17T00:00:00.000Z',
    updated_at: '2026-03-17T00:00:00.000Z',
  };
}

describe('session-starter', () => {
  it('returns owner and starts orchestrator when a created discussion acquires the lock', async () => {
    const run = vi.fn(async () => undefined);

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'cli' },
      discussionId: 'd1',
      onEvent: () => undefined,
      repository: {
        async getDiscussion() {
          return createDiscussion('created');
        },
      },
      lockStore: {
        async acquireLock() {
          return true;
        },
        async releaseLock() {
          return true;
        },
      },
      runner: run,
    });

    expect(result.role).toBe('owner');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        discussionId: 'd1',
        lockAlreadyAcquired: true,
      })
    );
  });

  it('returns observer when the lock is already held', async () => {
    const run = vi.fn(async () => undefined);

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'web' },
      discussionId: 'd1',
      onEvent: () => undefined,
      repository: {
        async getDiscussion() {
          return createDiscussion('created');
        },
      },
      lockStore: {
        async acquireLock() {
          return false;
        },
        async releaseLock() {
          return true;
        },
      },
      runner: run,
    });

    expect(result.role).toBe('observer');
    expect(run).not.toHaveBeenCalled();
  });

  it('returns observer for already-running discussions without trying to start again', async () => {
    const run = vi.fn(async () => undefined);
    const acquireLock = vi.fn(async () => true);

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'web' },
      discussionId: 'd1',
      onEvent: () => undefined,
      repository: {
        async getDiscussion() {
          return createDiscussion('streaming');
        },
      },
      lockStore: {
        acquireLock,
        async releaseLock() {
          return true;
        },
      },
      runner: run,
    });

    expect(result.role).toBe('observer');
    expect(acquireLock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});

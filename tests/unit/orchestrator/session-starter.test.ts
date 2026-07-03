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
    billing_snapshot_id: 'billing-1',
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
  it('throws when the discussion does not exist', async () => {
    await expect(
      startOrAttachDiscussion({
        actor: { userId: 'u1', source: 'cli' },
        discussionId: 'missing',
        onEvent: () => undefined,
        repository: {
          async getDiscussion() {
            return null;
          },
        },
      })
    ).rejects.toThrow('Discussion missing was not found');
  });

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
    expect(result.execution).toBeInstanceOf(Promise);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        discussionId: 'd1',
        lockAlreadyAcquired: true,
      })
    );
  });

  it('passes a billing resolver on the web path and omits it on the cli path', async () => {
    const webRun = vi.fn(async () => undefined);
    await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'web' },
      discussionId: 'd1',
      onEvent: () => undefined,
      repository: { async getDiscussion() { return createDiscussion('created'); } },
      lockStore: {
        async acquireLock() { return true; },
        async releaseLock() { return true; },
      },
      runner: webRun,
    });

    expect(webRun).toHaveBeenCalledWith(
      expect.objectContaining({ billingResolver: expect.anything() })
    );

    const cliRun = vi.fn(async () => undefined);
    await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'cli' },
      discussionId: 'd1',
      onEvent: () => undefined,
      repository: { async getDiscussion() { return createDiscussion('created'); } },
      lockStore: {
        async acquireLock() { return true; },
        async releaseLock() { return true; },
      },
      runner: cliRun,
    });

    expect(cliRun).toHaveBeenCalledWith(
      expect.objectContaining({ discussionId: 'd1', lockAlreadyAcquired: true })
    );
    expect(cliRun).not.toHaveBeenCalledWith(
      expect.objectContaining({ billingResolver: expect.anything() })
    );
  });

  it('throws INVALID_DISCUSSION_STATE before starting the orchestrator', async () => {
    const run = vi.fn(async () => undefined);

    await expect(
      startOrAttachDiscussion({
        actor: { userId: 'u1', source: 'cli' },
        discussionId: 'd1',
        onEvent: () => undefined,
        repository: {
          async getDiscussion() {
            return {
              ...createDiscussion('created'),
              billing_snapshot_id: null,
            };
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
      })
    ).rejects.toThrow('INVALID_DISCUSSION_STATE');

    expect(run).not.toHaveBeenCalled();
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
    expect(result.execution).toBeNull();
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
    expect(result.execution).toBeNull();
    expect(acquireLock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});

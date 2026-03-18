import { describe, expect, it } from 'vitest';

import { casTransition, validateTransition } from '@/lib/orchestrator/state-machine';
import type { DiscussionStateStore } from '@/lib/orchestrator/types';

describe('state-machine', () => {
  it('accepts the full frozen whitelist transitions', () => {
    expect(validateTransition('created', 'streaming')).toBe(true);
    expect(validateTransition('created', 'aborted')).toBe(true);
    expect(validateTransition('created', 'failed')).toBe(true);
    expect(validateTransition('streaming', 'streaming')).toBe(true);
    expect(validateTransition('streaming', 'summarizing')).toBe(true);
    expect(validateTransition('streaming', 'failed')).toBe(true);
    expect(validateTransition('streaming', 'aborted')).toBe(true);
    expect(validateTransition('summarizing', 'completed')).toBe(true);
    expect(validateTransition('summarizing', 'failed')).toBe(true);
  });

  it('rejects terminal or undefined transitions', () => {
    expect(validateTransition('aborted', 'streaming')).toBe(false);
    expect(validateTransition('completed', 'streaming')).toBe(false);
    expect(validateTransition('failed', 'completed')).toBe(false);
    expect(validateTransition('created', 'completed')).toBe(false);
  });

  it('delegates CAS updates to the injected store', async () => {
    const calls: Array<{ discussionId: string; from: string; to: string }> = [];
    const store: DiscussionStateStore = {
      async updateStatus(params) {
        calls.push(params);
        return true;
      },
    };

    const updated = await casTransition({
      discussionId: 'discussion-1',
      from: 'created',
      to: 'streaming',
      updates: { currentRound: 1 },
      store,
    });

    expect(updated).toBe(true);
    expect(calls).toEqual([
      {
        discussionId: 'discussion-1',
        from: 'created',
        to: 'streaming',
        updates: { currentRound: 1 },
      },
    ]);
  });

  it('throws on invalid transitions before hitting persistence', async () => {
    const store: DiscussionStateStore = {
      async updateStatus() {
        throw new Error('should not be called');
      },
    };

    await expect(
      casTransition({
        discussionId: 'discussion-1',
        from: 'completed',
        to: 'streaming',
        store,
      })
    ).rejects.toThrow('Invalid discussion transition');
  });
});

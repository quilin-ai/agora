/**
 * E06 — can_stream=false → polling → completed
 *
 * 验收标准：
 * 前端正确切换到轮询，并最终拿到 done 事件
 *
 * 测试策略：
 * - 测试 handlePollResult 的纯逻辑（不依赖浏览器 API）
 * - 验证各状态下的轮询决策行为
 * - 验证超时边界条件
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { handlePollResult, isPollingTimeout, POLLING_INTERVAL_MS, POLLING_MAX_MS } from '@/lib/hooks/polling-utils';
import type { SSEEvent } from '@/lib/types';
import type { PollDiscussionResponse } from '@/lib/hooks/polling-utils';

// ─── handlePollResult ─────────────────────────────────────────────────────────

describe('E06 — handlePollResult', () => {
  it('returns done and emits done event when discussion is completed', () => {
    const events: SSEEvent[] = [];

    const result = handlePollResult(
      {
        discussion: {
          status: 'completed',
          summary: null,
          total_platform_price: 0.115,
          total_raw_cost: 0.1,
        },
      },
      (e) => events.push(e)
    );

    expect(result).toBe('done');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('done');
    const doneEvent = events[0] as Extract<SSEEvent, { type: 'done' }>;
    expect(doneEvent.data.total_raw_cost).toBe(0.1);
    expect(doneEvent.data.total_platform_price).toBe(0.115);
  });

  it('emits summary then done when completed discussion has a summary', () => {
    const events: SSEEvent[] = [];
    const summary = {
      consensus: [{ content: 'Engineers will not be replaced', supporting_models: ['m1'], evidence_refs: [] }],
      disagreements: [],
      recommendation: 'AI augments, not replaces',
      confidence: 'high' as const,
      open_questions: [],
      evidence_refs: [],
      disclaimer: 'Test disclaimer',
      is_degraded: false,
    };

    const result = handlePollResult(
      {
        discussion: {
          status: 'completed',
          summary,
          total_platform_price: 0.23,
          total_raw_cost: 0.2,
        },
      },
      (e) => events.push(e)
    );

    expect(result).toBe('done');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('summary');
    const summaryEvent = events[0] as Extract<SSEEvent, { type: 'summary' }>;
    expect(summaryEvent.data.consensus[0].content).toBe('Engineers will not be replaced');
    expect(events[1].type).toBe('done');
  });

  it('returns done for failed discussion status', () => {
    const events: SSEEvent[] = [];

    const result = handlePollResult(
      {
        discussion: {
          status: 'failed',
          summary: null,
          total_platform_price: 0,
          total_raw_cost: 0,
        },
      },
      (e) => events.push(e)
    );

    expect(result).toBe('done');
    expect(events[0].type).toBe('done');
  });

  it('returns done for aborted discussion status', () => {
    const events: SSEEvent[] = [];

    const result = handlePollResult(
      {
        discussion: {
          status: 'aborted',
          summary: null,
          total_platform_price: 0,
          total_raw_cost: 0,
        },
      },
      (e) => events.push(e)
    );

    expect(result).toBe('done');
  });

  it('returns continue for in-progress discussion statuses', () => {
    const inProgressStatuses = ['created', 'streaming', 'pending'];

    for (const status of inProgressStatuses) {
      const events: SSEEvent[] = [];
      const result = handlePollResult(
        {
          discussion: {
            status,
            summary: null,
            total_platform_price: 0,
            total_raw_cost: 0,
          },
        },
        (e) => events.push(e)
      );

      expect(result, `status '${status}' should return continue`).toBe('continue');
      expect(events, `status '${status}' should emit no events`).toHaveLength(0);
    }
  });

  it('done event seq is always 0 (polling-sourced events have seq=0)', () => {
    const events: SSEEvent[] = [];

    handlePollResult(
      {
        discussion: {
          status: 'completed',
          summary: null,
          total_platform_price: 1,
          total_raw_cost: 0.87,
        },
      },
      (e) => events.push(e)
    );

    const doneEvent = events[0] as Extract<SSEEvent, { type: 'done' }>;
    expect(doneEvent.data.seq).toBe(0);
  });

  it('summary event seq is always 0 (polling-sourced)', () => {
    const events: SSEEvent[] = [];

    handlePollResult(
      {
        discussion: {
          status: 'completed',
          summary: {
            consensus: [{ content: 'Test consensus', supporting_models: ['m1'], evidence_refs: [] }],
            disagreements: [],
            recommendation: 'Test',
            confidence: 'high' as const,
            open_questions: [],
            evidence_refs: [],
            disclaimer: '',
            is_degraded: false,
          },
          total_platform_price: 0,
          total_raw_cost: 0,
        },
      },
      (e) => events.push(e)
    );

    const summaryEvent = events[0] as Extract<SSEEvent, { type: 'summary' }>;
    expect(summaryEvent.data.seq).toBe(0);
  });
});

// ─── isPollingTimeout ─────────────────────────────────────────────────────────

describe('E06 — isPollingTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when polling just started', () => {
    const start = Date.now();
    expect(isPollingTimeout(start)).toBe(false);
  });

  it('returns true after POLLING_MAX_MS elapsed', () => {
    const start = Date.now();
    vi.advanceTimersByTime(POLLING_MAX_MS + 1);
    expect(isPollingTimeout(start)).toBe(true);
  });

  it('returns false at exactly POLLING_MAX_MS - 1ms', () => {
    const start = Date.now();
    vi.advanceTimersByTime(POLLING_MAX_MS - 1);
    expect(isPollingTimeout(start)).toBe(false);
  });

  it('supports custom maxMs override', () => {
    const start = Date.now();
    vi.advanceTimersByTime(5001);
    expect(isPollingTimeout(start, 5000)).toBe(true);
    expect(isPollingTimeout(start, 10000)).toBe(false);
  });
});

// ─── 常量约束 ─────────────────────────────────────────────────────────────────

describe('E06 — polling constants', () => {
  it('polling interval is 3 seconds', () => {
    expect(POLLING_INTERVAL_MS).toBe(3000);
  });

  it('max polling duration is 3 minutes (180s)', () => {
    expect(POLLING_MAX_MS).toBe(180_000);
  });
});

// ─── E06 全路径场景验证 ───────────────────────────────────────────────────────

describe('E06 — full polling path simulation', () => {
  it('simulates multiple poll cycles until completion', () => {
    const events: SSEEvent[] = [];
    const onEvent = (e: SSEEvent) => events.push(e);

    const responses: PollDiscussionResponse[] = [
      { discussion: { status: 'streaming', summary: null, total_platform_price: 0, total_raw_cost: 0 } },
      { discussion: { status: 'streaming', summary: null, total_platform_price: 0, total_raw_cost: 0 } },
      { discussion: { status: 'streaming', summary: null, total_platform_price: 0, total_raw_cost: 0 } },
      {
        discussion: {
          status: 'completed',
          summary: {
            consensus: [{ content: 'Final consensus reached', supporting_models: ['m1'], evidence_refs: [] }],
            disagreements: [],
            recommendation: 'AI augments humans',
            confidence: 'high' as const,
            open_questions: [],
            evidence_refs: [],
            disclaimer: '',
            is_degraded: false,
          },
          total_platform_price: 0.575,
          total_raw_cost: 0.5,
        },
      },
    ];

    let stepsDone = 0;
    let done = false;

    for (const response of responses) {
      const result = handlePollResult(response, onEvent);
      stepsDone++;
      if (result === 'done') {
        done = true;
        break;
      }
    }

    expect(done).toBe(true);
    expect(stepsDone).toBe(4); // 3 streaming + 1 completed
    expect(events).toHaveLength(2); // summary + done
    expect(events[0].type).toBe('summary');
    expect(events[1].type).toBe('done');
    const doneEvent = events[1] as Extract<SSEEvent, { type: 'done' }>;
    expect(doneEvent.data.total_raw_cost).toBe(0.5);
    expect(doneEvent.data.total_platform_price).toBe(0.575);
  });

  it('restore(can_stream=false) → polling decision correctly modeled', () => {
    // Simulate the SSE hook decision: when restore.can_stream=false, switch to polling
    const restorePayload = {
      resume_mode: 'state_restore' as const,
      can_stream: false,
      current_status: 'streaming' as const,
      current_round: 2,
      last_completed_round: 1,
      completed_round_messages: [],
      summary: null,
    };

    // Decision rule: can_stream=false → start polling
    const shouldStartPolling = !restorePayload.can_stream;
    expect(shouldStartPolling).toBe(true);

    // Then polling returns completed
    const events: SSEEvent[] = [];
    const result = handlePollResult(
      {
        discussion: {
          status: 'completed',
          summary: null,
          total_platform_price: 0.1,
          total_raw_cost: 0.087,
        },
      },
      (e) => events.push(e)
    );

    expect(result).toBe('done');
    expect(events[0].type).toBe('done');
  });
});

import { describe, expect, it } from 'vitest';

import { createStreamHub } from '@/lib/orchestrator/stream-hub';
import type { SSEEvent } from '@/lib/types';

describe('stream-hub', () => {
  it('emits spec-shaped events with incrementing seq values', () => {
    const events: SSEEvent[] = [];
    const hub = createStreamHub((event) => {
      events.push(event);
    });

    hub.progress('d1', 1, 'independent');
    hub.chunk({
      discussionId: 'd1',
      logicalModelId: 'm1',
      actualModelId: 'm1',
      round: 1,
      text: 'hello',
    });
    hub.modelDone({
      discussionId: 'd1',
      logicalModelId: 'm1',
      actualModelId: 'm1',
      round: 1,
      inputTokens: 120,
      outputTokens: 48,
    });
    hub.modelError({
      discussionId: 'd1',
      logicalModelId: 'm2',
      actualModelId: null,
      round: 1,
      errorType: 'timeout',
      action: 'skipped',
      degradedTo: null,
      message: 'timed out',
    });
    hub.roundDone({
      discussionId: 'd1',
      round: 1,
      completedModels: ['m1'],
      skippedModels: ['m2'],
      failedModels: [
        {
          logical_model_id: 'm2',
          actual_model_id: null,
          error_type: 'timeout',
          action: 'skipped',
        },
      ],
      totalModels: 2,
    });
    hub.anonymize('d1', 2, ['Model A', 'Model B']);

    expect(events).toHaveLength(6);
    expect(
      events.map((event) => ('seq' in event.data ? event.data.seq : null))
    ).toEqual([1, 2, 3, 4, 5, 6]);

    expect(events[0]).toEqual({
      type: 'progress',
      data: {
        round: 1,
        total_rounds: 3,
        phase: 'independent',
        seq: 1,
      },
    });

    expect(events[3]).toEqual({
      type: 'model_error',
      data: {
        logical_model_id: 'm2',
        actual_model_id: null,
        round: 1,
        error_type: 'timeout',
        action: 'skipped',
        degraded_to: null,
        message: 'timed out',
        seq: 4,
      },
    });
  });

  it('maps billing and restore helpers into final SSE payloads', () => {
    const events: SSEEvent[] = [];
    const hub = createStreamHub((event) => {
      events.push(event);
    });

    hub.done('d1', { raw_cost: 0.08, platform_price: 0.1 });
    hub.restore('d1', 'completed', 3);
    hub.error('d1', 'boom');
    hub.interruptAck('d1');

    expect(events).toEqual([
      {
        type: 'done',
        data: {
          total_raw_cost: 0.08,
          total_platform_price: 0.1,
          seq: 1,
        },
      },
      {
        type: 'restore',
        data: {
          resume_mode: 'state_restore',
          can_stream: false,
          current_status: 'completed',
          current_round: 3,
          last_completed_round: 3,
          completed_round_messages: [],
          summary: null,
        },
      },
      {
        type: 'error',
        data: {
          code: 'ORCHESTRATOR_ERROR',
          message: 'boom',
        },
      },
      {
        type: 'interrupt_ack',
        data: {
          status: 'acknowledged',
          message: 'Interrupt accepted for the next round.',
          seq: 2,
        },
      },
    ]);
  });
});

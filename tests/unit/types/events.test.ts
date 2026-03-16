import { describe, expect, it } from 'vitest';

import type {
  ActorContext,
  AnonymizeEvent,
  BillingCost,
  ChunkEvent,
  CreateDiscussionRequest,
  CreateDiscussionResponse,
  CreditTransactionType,
  DiscussionStatus,
  DiscussionSummaryFinal,
  DiscussionTransition,
  DoneEvent,
  ErrorEvent,
  InterruptAckEvent,
  ModelDoneEvent,
  ModelErrorEvent,
  ProgressEvent,
  RestoreEvent,
  RoundDoneEvent,
  RoundNumber,
  RoundType,
  SSEEvent,
  SSEEventType,
  SecretaryRawOutput,
  SummaryEvent,
  TerminalStatus,
} from '@/lib/types';

/**
 * 这些测试在编译期验证类型正确性。
 * 如果类型定义与 CORE_SPEC 不一致，typecheck 会先于测试失败。
 */
describe('type definitions compile-time checks', () => {
  it('ActorContext accepts all valid sources', () => {
    const cli: ActorContext = { userId: 'u1', source: 'cli' };
    const web: ActorContext = { userId: 'u2', source: 'web' };
    const test: ActorContext = { userId: 'u3', source: 'test' };
    expect(cli.source).toBe('cli');
    expect(web.source).toBe('web');
    expect(test.source).toBe('test');
  });

  it('DiscussionStatus covers exactly 6 values', () => {
    const statuses: DiscussionStatus[] = [
      'created', 'streaming', 'summarizing',
      'completed', 'failed', 'aborted',
    ];
    expect(statuses).toHaveLength(6);
  });

  it('TerminalStatus is subset of DiscussionStatus', () => {
    const terminals: TerminalStatus[] = ['completed', 'failed', 'aborted'];
    expect(terminals).toHaveLength(3);
  });

  it('RoundType covers 3 values', () => {
    const types: RoundType[] = ['independent', 'review', 'rebuttal'];
    expect(types).toHaveLength(3);
  });

  it('RoundNumber covers 1/2/3', () => {
    const rounds: RoundNumber[] = [1, 2, 3];
    expect(rounds).toHaveLength(3);
  });

  it('DiscussionTransition covers all 9 whitelist transitions', () => {
    const transitions: DiscussionTransition[] = [
      { from: 'created', to: 'streaming' },
      { from: 'created', to: 'aborted' },
      { from: 'created', to: 'failed' },
      { from: 'streaming', to: 'streaming' },
      { from: 'streaming', to: 'summarizing' },
      { from: 'streaming', to: 'failed' },
      { from: 'streaming', to: 'aborted' },
      { from: 'summarizing', to: 'completed' },
      { from: 'summarizing', to: 'failed' },
    ];
    expect(transitions).toHaveLength(9);
  });

  it('SSEEventType covers exactly 11 event types', () => {
    const types: SSEEventType[] = [
      'progress', 'chunk', 'model_done', 'model_error',
      'round_done', 'anonymize', 'summary', 'done',
      'restore', 'error', 'interrupt_ack',
    ];
    expect(types).toHaveLength(11);
  });

  it('SSEEvent discriminated union works with type narrowing', () => {
    const event: SSEEvent = {
      type: 'chunk',
      data: { discussion_id: 'd1', model_id: 'claude', text: 'hello' },
    };

    if (event.type === 'chunk') {
      expect(event.data.text).toBe('hello');
    }
  });

  it('all 11 SSEEvent variants can be constructed', () => {
    const events: SSEEvent[] = [
      { type: 'progress', data: { discussion_id: 'd1', round: 1, phase: 'starting' } } satisfies ProgressEvent,
      { type: 'chunk', data: { discussion_id: 'd1', model_id: 'm1', text: 'hi' } } satisfies ChunkEvent,
      { type: 'model_done', data: { discussion_id: 'd1', model_id: 'm1', tokens: 150 } } satisfies ModelDoneEvent,
      { type: 'model_error', data: { discussion_id: 'd1', model_id: 'm1', error_message: 'timed out' } } satisfies ModelErrorEvent,
      { type: 'round_done', data: { discussion_id: 'd1', round: 1 } } satisfies RoundDoneEvent,
      { type: 'anonymize', data: { discussion_id: 'd1', labels: ['Model A', 'Model B'] } } satisfies AnonymizeEvent,
      { type: 'summary', data: { discussion_id: 'd1', summary: { raw_output: { consensus: '', disagreements: [], recommendation: '', confidence: 0.8, open_questions: [], evidence_refs: [] }, generated_at: '', secretary_model: 'gpt-4o', token_usage: { prompt_tokens: 0, completion_tokens: 0 } } } } satisfies SummaryEvent,
      { type: 'done', data: { discussion_id: 'd1', billing: { raw_cost: 0.08, platform_price: 0.1 } } } satisfies DoneEvent,
      { type: 'restore', data: { discussion_id: 'd1', status: 'completed', last_completed_round: 3 } } satisfies RestoreEvent,
      { type: 'error', data: { discussion_id: 'd1', error_message: 'boom' } } satisfies ErrorEvent,
      { type: 'interrupt_ack', data: { discussion_id: 'd1' } } satisfies InterruptAckEvent,
    ];
    expect(events).toHaveLength(11);
  });

  it('CreditTransactionType covers 4 values', () => {
    const types: CreditTransactionType[] = ['hold', 'release', 'refund', 'settle'];
    expect(types).toHaveLength(4);
  });

  it('BillingCost has raw_cost and platform_price', () => {
    const cost: BillingCost = { raw_cost: 0.082, platform_price: 0.0995 };
    expect(cost.raw_cost).toBe(0.082);
    expect(cost.platform_price).toBe(0.0995);
  });

  it('SecretaryRawOutput has all required fields', () => {
    const output: SecretaryRawOutput = {
      consensus: 'agreed',
      disagreements: ['point A'],
      recommendation: 'go with option 1',
      confidence: 0.85,
      open_questions: ['what about X?'],
      evidence_refs: ['ref1'],
    };
    expect(output.confidence).toBe(0.85);
    expect(output.decision_boundary).toBeUndefined();
  });

  it('DiscussionSummaryFinal wraps SecretaryRawOutput', () => {
    const summary: DiscussionSummaryFinal = {
      raw_output: {
        consensus: '',
        disagreements: [],
        recommendation: '',
        confidence: 0,
        open_questions: [],
        evidence_refs: [],
      },
      generated_at: '2026-03-17T00:00:00Z',
      secretary_model: 'gpt-4o',
      token_usage: { prompt_tokens: 500, completion_tokens: 200 },
    };
    expect(summary.secretary_model).toBe('gpt-4o');
  });

  it('CreateDiscussionRequest / Response types are correct', () => {
    const req: CreateDiscussionRequest = {
      topic: 'test topic',
      model_ids: ['claude', 'gpt-4o'],
    };
    const res: CreateDiscussionResponse = {
      discussion_id: 'd1',
      conversation_id: 'c1',
      status: 'created',
    };
    expect(req.model_ids).toHaveLength(2);
    expect(res.status).toBe('created');
  });
});

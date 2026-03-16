import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type {
  ActorContext,
  CreateDiscussionRequest,
  CreateDiscussionResponse,
  DiscussionSummaryFinal,
  SSEEvent,
  SecretaryRawOutput,
} from '@/lib/types';
import {
  actorContextSchema,
  createDiscussionRequestSchema,
  createDiscussionResponseSchema,
  discussionStatusSchema,
  discussionSummaryFinalSchema,
  sseEventSchema,
  secretaryRawOutputSchema,
} from '@/lib/types/schemas';

describe('zod schemas', () => {
  it('parses ActorContext and rejects extra fields', () => {
    const parsed: ActorContext = actorContextSchema.parse({
      userId: 'user-1',
      source: 'cli',
    });

    expect(parsed.source).toBe('cli');
    expect(
      actorContextSchema.safeParse({
        userId: 'user-1',
        source: 'cli',
        extra: true,
      }).success
    ).toBe(false);
  });

  it('parses CreateDiscussionRequest and rejects invalid payloads', () => {
    const valid: CreateDiscussionRequest = createDiscussionRequestSchema.parse({
      topic: 'Which model should lead the synthesis?',
      model_ids: ['claude', 'gpt-4o'],
      conversation_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(valid.model_ids).toHaveLength(2);
    expect(
      createDiscussionRequestSchema.safeParse({
        topic: '',
        model_ids: ['claude'],
      }).success
    ).toBe(false);
  });

  it('parses CreateDiscussionResponse with frozen status values', () => {
    const valid: CreateDiscussionResponse = createDiscussionResponseSchema.parse({
      discussion_id: 'discussion-1',
      conversation_id: 'conversation-1',
      status: 'created',
    });

    expect(valid.status).toBe('created');
    expect(discussionStatusSchema.safeParse('invalid').success).toBe(false);
  });

  it('parses Secretary output and rejects invalid confidence', () => {
    const rawOutput: SecretaryRawOutput = secretaryRawOutputSchema.parse({
      consensus: 'Models agree on a conservative rollout.',
      disagreements: ['Model B wants wider beta access.'],
      recommendation: 'Start with invite-only rollout.',
      confidence: 0.82,
      open_questions: ['How much monitoring is needed?'],
      evidence_refs: ['ref-1'],
    });

    const finalSummary: DiscussionSummaryFinal = discussionSummaryFinalSchema.parse({
      raw_output: rawOutput,
      generated_at: '2026-03-17T00:00:00Z',
      secretary_model: 'gpt-4o',
      token_usage: {
        prompt_tokens: 1200,
        completion_tokens: 280,
      },
    });

    expect(finalSummary.raw_output.confidence).toBe(0.82);
    expect(
      secretaryRawOutputSchema.safeParse({
        ...rawOutput,
        confidence: 1.5,
      }).success
    ).toBe(false);
  });

  it('parses SSE events and rejects unknown event types / extra fields', () => {
    const event: SSEEvent = sseEventSchema.parse({
      type: 'chunk',
      data: {
        discussion_id: 'discussion-1',
        model_id: 'claude',
        text: 'streaming text',
      },
    });

    expect(event.type).toBe('chunk');
    expect(
      sseEventSchema.safeParse({
        type: 'chunk',
        data: {
          discussion_id: 'discussion-1',
          model_id: 'claude',
          text: 'streaming text',
          extra: true,
        },
      }).success
    ).toBe(false);
    expect(
      sseEventSchema.safeParse({
        type: 'unknown',
        data: {},
      }).success
    ).toBe(false);
  });

  it('parses all 11 SSE event types successfully', () => {
    const samples = [
      { type: 'progress', data: { discussion_id: 'd1', round: 1, phase: 'starting' } },
      { type: 'chunk', data: { discussion_id: 'd1', model_id: 'm1', text: 'hi' } },
      { type: 'model_done', data: { discussion_id: 'd1', model_id: 'm1', tokens: 150 } },
      { type: 'model_error', data: { discussion_id: 'd1', model_id: 'm1', error_message: 'timeout' } },
      { type: 'round_done', data: { discussion_id: 'd1', round: 1 } },
      { type: 'anonymize', data: { discussion_id: 'd1', labels: ['A', 'B'] } },
      {
        type: 'summary',
        data: {
          discussion_id: 'd1',
          summary: {
            raw_output: {
              consensus: 'ok',
              disagreements: [],
              recommendation: 'go',
              confidence: 0.8,
              open_questions: [],
              evidence_refs: [],
            },
            generated_at: '2026-03-17T00:00:00Z',
            secretary_model: 'gpt-4o',
            token_usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
            },
          },
        },
      },
      { type: 'done', data: { discussion_id: 'd1', billing: { raw_cost: 0.08, platform_price: 0.1 } } },
      { type: 'restore', data: { discussion_id: 'd1', status: 'completed', last_completed_round: 3 } },
      { type: 'error', data: { discussion_id: 'd1', error_message: 'boom' } },
      { type: 'interrupt_ack', data: { discussion_id: 'd1' } },
    ] as const;

    for (const sample of samples) {
      expect(() => sseEventSchema.parse(sample)).not.toThrow();
    }

    expect(samples).toHaveLength(11);
  });

  it('keeps z.infer results compatible with Task-004 types', () => {
    const actorExample: z.infer<typeof actorContextSchema> = {
      userId: 'user-1',
      source: 'web',
    };
    const actorType: ActorContext = actorExample;
    expect(actorType.source).toBe('web');

    const requestExample: z.infer<typeof createDiscussionRequestSchema> = {
      topic: 'A topic',
      model_ids: ['claude', 'gpt-4o'],
    };
    const requestType: CreateDiscussionRequest = requestExample;
    expect(requestType.model_ids).toHaveLength(2);

    const eventExample: z.infer<typeof sseEventSchema> = {
      type: 'interrupt_ack',
      data: { discussion_id: 'discussion-1' },
    };
    const eventType: SSEEvent = eventExample;
    expect(eventType.type).toBe('interrupt_ack');
  });
});

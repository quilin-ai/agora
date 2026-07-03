import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/orchestrator/anonymizer', () => {
  return {
    anonymizeModels: vi.fn(async ({ discussionId, modelIds }: { discussionId: string; modelIds: string[] }) =>
      modelIds.map((modelId, index) => ({
        discussionId,
        roundNumber: 2,
        modelId,
        anonymousLabel: `Model ${String.fromCharCode(65 + index)}`,
      }))
    ),
    anonymizeRoundResponsesForReviewer: vi.fn(
      (
        responses: Array<{ modelId: string; text: string }>,
        mappings: Array<{ modelId: string; anonymousLabel: string }>,
        reviewerModelId: string
      ) =>
        responses
          .filter((response) => response.modelId !== reviewerModelId)
          .map((response) => {
            const mapping = mappings.find((item) => item.modelId === response.modelId);
            return `${mapping?.anonymousLabel ?? response.modelId}\n${response.text}`;
          })
          .join('\n\n')
    ),
  };
});

vi.mock('@/lib/grounding/service', () => {
  return {
    prepareGroundingContext: vi.fn(async () => ({
      used: false,
      skippedReason: 'not_needed',
      searchedAt: null,
      provider: null,
      summaryModel: null,
      sources: [],
      brief: '',
      errorMessage: null,
    })),
    buildConsensusGroundingRoleDescription: vi.fn(() => ''),
  };
});

import * as anonymizerModule from '@/lib/orchestrator/anonymizer';
import { runConsensusDiscussion } from '@/lib/orchestrator/consensus';
import type {
  BillingResolver,
  CompletionRequest,
  CompletionResult,
  ConsensusRepository,
  DiscussionRuntimeRecord,
  OpenRouterClient,
  PromptTemplateStore,
} from '@/lib/orchestrator/types';
import type { DiscussionSummaryFinal, SSEEvent } from '@/lib/types';

function createRepository(): {
  repository: ConsensusRepository;
  rounds: Array<{
    roundNumber: number;
    status: string;
    failedModels?: Array<{
      logical_model_id: string;
      actual_model_id: string | null;
      error_type: string;
      action: 'retrying' | 'degraded' | 'skipped';
    }>;
    roundRawCost?: number;
    roundInputTokens?: number;
    roundOutputTokens?: number;
  }>;
  summary: { current: DiscussionSummaryFinal | null };
  discussion: DiscussionRuntimeRecord;
} {
  const rounds: Array<{
    roundNumber: number;
    status: string;
    failedModels?: Array<{
      logical_model_id: string;
      actual_model_id: string | null;
      error_type: string;
      action: 'retrying' | 'degraded' | 'skipped';
    }>;
    roundRawCost?: number;
    roundInputTokens?: number;
    roundOutputTokens?: number;
  }> = [];
  const summary = { current: null as DiscussionSummaryFinal | null };
  const discussion: DiscussionRuntimeRecord = {
    id: 'discussion-1',
    conversationId: 'discussion-1',
    topic: 'Phase A1 paid smoke path',
    status: 'created',
    currentRound: 0,
    lastCompletedRound: 0,
    modelIds: ['openai/gpt-5-nano', 'openai/gpt-4.1-nano', 'openai/gpt-4o-mini'],
    summary: null,
    pricingData: {
      'openai/gpt-5-nano': { input: 0.05, output: 0.4 },
      'openai/gpt-4.1-nano': { input: 0.1, output: 0.8 },
      'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    },
  };

  return {
    discussion,
    rounds,
    summary,
    repository: {
      async getDiscussion() {
        return discussion;
      },
      async saveRound(record) {
        rounds.push({
          roundNumber: record.roundNumber,
          status: record.status,
          failedModels: record.failedModels,
          roundRawCost: record.roundRawCost,
          roundInputTokens: record.roundInputTokens,
          roundOutputTokens: record.roundOutputTokens,
        });
      },
      async saveSummary(_discussionId, value) {
        summary.current = value;
      },
    },
  };
}

function createPromptStore(): PromptTemplateStore {
  return {
    async getActiveTemplate(lookup) {
      return {
        id: `${lookup.role}-${lookup.roundType}`,
        version: '1.0.0',
        model: lookup.modelId,
        mode: lookup.mode,
        role: lookup.role,
        roundType: lookup.roundType,
        content: 'Topic={{topic}}\nContext={{context}}\nAnon={{anonymized_round1_texts}}\nCompressed={{compressed_context}}\nModels={{participating_models}}',
        isActive: true,
      };
    },
  };
}

function createClient(): OpenRouterClient {
  let streamCallCount = 0;

  return {
    async *streamCompletion(request: CompletionRequest) {
      streamCallCount += 1;
      const text = `response-${streamCallCount}-${request.model}`;
      yield { text };
      return {
        text,
        usage: {
          promptTokens: 100 + streamCallCount,
          completionTokens: 200 + streamCallCount,
        },
        finishReason: 'stop',
      } satisfies CompletionResult;
    },
    async complete() {
      return {
        text: JSON.stringify({
          consensus: [
            {
              content: 'Proceed with the paid smoke validation path.',
              supporting_models: [
                'openai/gpt-5-nano',
                'openai/gpt-4.1-nano',
              ],
              evidence_refs: ['round-1', 'round-2', 'round-3'],
            },
          ],
          disagreements: [
            {
              topic: 'How strict the rollout guardrails should be',
              type: 'preference_difference',
              positions: [
                {
                  model_id: 'openai/gpt-5-nano',
                  stance: 'for',
                  summary: 'Keep rollout tightly controlled.',
                },
                {
                  model_id: 'openai/gpt-4o-mini',
                  stance: 'neutral',
                  summary: 'Expand only after a small successful test.',
                },
              ],
              severity: 'medium',
            },
          ],
          recommendation: 'Proceed with the paid smoke path under explicit limits.',
          confidence: 'high',
          open_questions: ['What budget cap should be used?'],
          decision_boundary: 'Only continue if the paid smoke path remains reproducible.',
          evidence_refs: ['round-1', 'round-2', 'round-3'],
        }),
        usage: { promptTokens: 88, completionTokens: 144 },
        finishReason: 'stop',
      };
    },
  };
}

function createPartialFailureClient(): OpenRouterClient {
  return {
    async *streamCompletion(request: CompletionRequest) {
      if (request.model === 'openai/gpt-4o-mini') {
        throw new Error('provider returned error');
      }

      yield { text: `ok-${request.model}` };
      return {
        text: `ok-${request.model}`,
        usage: {
          promptTokens: 80,
          completionTokens: 40,
        },
        finishReason: 'stop',
      } satisfies CompletionResult;
    },
    async complete() {
      return {
        text: JSON.stringify({
          consensus: [
            {
              content: 'One participant degraded but the round still converged.',
              supporting_models: ['openai/gpt-5-nano', 'openai/gpt-4.1-nano', 'openai/gpt-4o-mini'],
              evidence_refs: ['round-1'],
            },
          ],
          disagreements: [],
          recommendation: 'Continue with the surviving participants.',
          confidence: 'medium',
          open_questions: [],
          evidence_refs: ['round-1'],
        }),
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'stop',
      };
    },
  };
}

function createInsufficientModelsClient(): OpenRouterClient {
  const attempts = new Map<string, number>();

  return {
    async *streamCompletion(request: CompletionRequest) {
      const count = (attempts.get(request.model) ?? 0) + 1;
      attempts.set(request.model, count);

      if (request.model !== 'openai/gpt-5-nano' || count > 1) {
        throw new Error('provider returned error');
      }

      yield { text: 'only one survives' };
      return {
        text: 'only one survives',
        usage: {
          promptTokens: 50,
          completionTokens: 25,
        },
        finishReason: 'stop',
      } satisfies CompletionResult;
    },
    async complete() {
      throw new Error('summary should not execute');
    },
  };
}

/**
 * I01: 1 model TTFT timeout → skipped; 2 others succeed → round continues
 * The model throws a "TTFT timeout" error to simulate the post-timeout skip path.
 */
function createTimeoutOneModelClient(): OpenRouterClient {
  return {
    async *streamCompletion(request: CompletionRequest) {
      if (request.model === 'openai/gpt-4o-mini') {
        // Simulate TTFT timeout skip (stream-hub converts this to timeout/skipped)
        throw new Error('TTFT timed out after 15000ms');
      }

      yield { text: `ok-${request.model}` };
      return {
        text: `ok-${request.model}`,
        usage: { promptTokens: 80, completionTokens: 40 },
        finishReason: 'stop',
      } satisfies CompletionResult;
    },
    async complete() {
      return {
        text: JSON.stringify({
          consensus: [
            {
              content: 'Two models succeeded despite one timeout.',
              supporting_models: ['openai/gpt-5-nano', 'openai/gpt-4.1-nano'],
              evidence_refs: ['round-1'],
            },
          ],
          disagreements: [],
          recommendation: 'Continue with the two remaining models.',
          confidence: 'medium',
          open_questions: [],
          evidence_refs: ['round-1'],
        }),
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: 'stop',
      };
    },
  };
}

/** C06: all 3 models fail → round cannot reach MIN → discussion fails */
function createAllModelsFailClient(): OpenRouterClient {
  return {
    // eslint-disable-next-line require-yield
    async *streamCompletion() {
      throw new Error('provider returned error: all down');
    },
    async complete() {
      throw new Error('summary should not execute');
    },
  };
}

describe('runConsensusDiscussion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes the three-round consensus flow and emits summary/done events', async () => {
    const events: SSEEvent[] = [];
    const { repository, rounds, summary } = createRepository();
    const promptStore = createPromptStore();
    const client = createClient();
    const transitions: Array<{ from: string; to: string }> = [];
    const billingResolver: BillingResolver = {
      async resolveForDiscussion() {
        return { raw_cost: 0.123, platform_price: 0.149 };
      },
    };

    await runConsensusDiscussion({
      discussionId: 'discussion-1',
      actor: { userId: 'u1', source: 'test' },
      onEvent: (event) => {
        events.push(event);
      },
      repository,
      promptStore,
      client,
      billingResolver,
      lockAlreadyAcquired: true,
      stateStore: {
        async updateStatus(params) {
          transitions.push({ from: params.from, to: params.to });
          return true;
        },
        async markFailed() {
          return true;
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
    });

    expect(rounds).toEqual([
      expect.objectContaining({ roundNumber: 1, status: 'completed' }),
      expect.objectContaining({ roundNumber: 2, status: 'completed' }),
      expect.objectContaining({ roundNumber: 3, status: 'completed' }),
    ]);
    expect(summary.current).not.toBeNull();
    expect(events.filter((event) => event.type === 'round_summary')).toHaveLength(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'round_summary',
        data: expect.objectContaining({
          round: 1,
          next_round: 2,
        }),
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'round_summary',
        data: expect.objectContaining({
          round: 2,
          next_round: 3,
        }),
      })
    );
    expect(events.some((event) => event.type === 'summary')).toBe(true);
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(events.filter((event) => event.type === 'round_done')).toHaveLength(3);
    // 3 次 round-2 匿名评审 + 3 次 round-3 rebuttal（round 3 现在基于 round-2 匿名真实全文）
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenCalledTimes(6);
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      expect.any(Array),
      'openai/gpt-5-nano'
    );
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      expect.any(Array),
      'openai/gpt-4.1-nano'
    );
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenNthCalledWith(
      3,
      expect.any(Array),
      expect.any(Array),
      'openai/gpt-4o-mini'
    );
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenNthCalledWith(
      4,
      expect.any(Array),
      expect.any(Array),
      'openai/gpt-5-nano'
    );
    expect(vi.mocked(anonymizerModule.anonymizeRoundResponsesForReviewer)).toHaveBeenNthCalledWith(
      6,
      expect.any(Array),
      expect.any(Array),
      'openai/gpt-4o-mini'
    );
    expect(rounds[0]).toMatchObject({
      roundRawCost: 0.000396,
      roundInputTokens: 309,
      roundOutputTokens: 609,
    });
    expect(transitions).toEqual([
      { from: 'created', to: 'streaming' },
      { from: 'streaming', to: 'streaming' },
      { from: 'streaming', to: 'streaming' },
      { from: 'streaming', to: 'summarizing' },
      { from: 'summarizing', to: 'completed' },
    ]);
  });

  it('continues when one model degrades but the round stays above the minimum threshold', async () => {
    const events: SSEEvent[] = [];
    const { repository, rounds } = createRepository();

    await runConsensusDiscussion({
      discussionId: 'discussion-1',
      actor: { userId: 'u1', source: 'test' },
      onEvent: (event) => {
        events.push(event);
      },
      repository,
      promptStore: createPromptStore(),
      client: createPartialFailureClient(),
      lockAlreadyAcquired: true,
      stateStore: {
        async updateStatus() {
          return true;
        },
        async markFailed() {
          return true;
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
    });

    expect(rounds[0]).toMatchObject({
      status: 'partial',
      roundRawCost: 0.00008,
      roundInputTokens: 240,
      roundOutputTokens: 120,
    });
    expect(rounds[0]?.failedModels).toEqual([
      {
        logical_model_id: 'openai/gpt-4o-mini',
        actual_model_id: 'openai/gpt-4o-mini',
        error_type: 'server_error',
        action: 'retrying',
      },
      {
        logical_model_id: 'openai/gpt-4o-mini',
        actual_model_id: 'openai/gpt-5-nano',
        error_type: 'server_error',
        action: 'degraded',
      },
    ]);

    const firstRoundDone = events.find(
      (event) => event.type === 'round_done' && event.data.round === 1
    );
    expect(firstRoundDone).toEqual({
      type: 'round_done',
      data: {
        round: 1,
        completed_models: [
          'openai/gpt-5-nano',
          'openai/gpt-4.1-nano',
          'openai/gpt-4o-mini',
        ],
        skipped_models: [],
        failed_models: [
          {
            logical_model_id: 'openai/gpt-4o-mini',
            actual_model_id: 'openai/gpt-4o-mini',
            error_type: 'server_error',
            action: 'retrying',
          },
          {
            logical_model_id: 'openai/gpt-4o-mini',
            actual_model_id: 'openai/gpt-5-nano',
            error_type: 'server_error',
            action: 'degraded',
          },
        ],
        total_models: 3,
        seq: expect.any(Number),
      },
    });

    expect(
      events.find((event) => event.type === 'round_summary' && event.data.round === 1)
    ).toEqual({
      type: 'round_summary',
      data: expect.objectContaining({
        round: 1,
        recommendation: 'Continue with the surviving participants.',
        confidence: 'medium',
      }),
    });
  });

  it('fails the discussion when a round drops below the minimum live participant threshold', async () => {
    const { repository, rounds } = createRepository();
    const transitions: Array<{ from: string; to: string }> = [];
    const failedCalls: string[] = [];

    await expect(
      runConsensusDiscussion({
        discussionId: 'discussion-1',
        actor: { userId: 'u1', source: 'test' },
        onEvent: () => undefined,
        repository,
        promptStore: createPromptStore(),
        client: createInsufficientModelsClient(),
        lockAlreadyAcquired: true,
        stateStore: {
          async updateStatus(params) {
            transitions.push({ from: params.from, to: params.to });
            return true;
          },
          async markFailed(params) {
            failedCalls.push(params.discussionId);
            return true;
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
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_LIVE_MODELS',
    });

    expect(rounds).toEqual([
      expect.objectContaining({
        roundNumber: 1,
        status: 'failed',
      }),
    ]);
    // 正常迁移只到 streaming；失败收尾走 markFailed（单条 IN(...) UPDATE），不再是固定 from 的 CAS。
    expect(transitions).toEqual([{ from: 'created', to: 'streaming' }]);
    expect(failedCalls).toEqual(['discussion-1']);
  });

  it('I01 — 1 model TTFT timeout is skipped and discussion continues with 2 remaining models', async () => {
    const events: SSEEvent[] = [];
    const { repository, rounds } = createRepository();

    await runConsensusDiscussion({
      discussionId: 'discussion-1',
      actor: { userId: 'u1', source: 'test' },
      onEvent: (event) => {
        events.push(event);
      },
      repository,
      promptStore: createPromptStore(),
      client: createTimeoutOneModelClient(),
      lockAlreadyAcquired: true,
      stateStore: {
        async updateStatus() {
          return true;
        },
        async markFailed() {
          return true;
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
    });

    // round 1 completes despite the timeout on gpt-4o-mini
    const round1Done = events.find(
      (e) => e.type === 'round_done' && e.data.round === 1
    );
    expect(round1Done).toBeDefined();

    // timeout is reflected in failed_models (action may be 'degraded' or 'skipped')
    const failedModels =
      (round1Done?.type === 'round_done' ? round1Done.data.failed_models : undefined) ?? [];
    const timeoutEntry = failedModels.find(
      (fm: { logical_model_id: string; error_type: string }) =>
        fm.logical_model_id === 'openai/gpt-4o-mini' && fm.error_type === 'timeout'
    );
    expect(timeoutEntry).toBeDefined();

    // Discussion completes — surviving models ≥ MIN(2)
    expect(events.some((e) => e.type === 'summary')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);

    // Round saved with a non-null roundNumber
    expect(rounds[0]).toMatchObject({ roundNumber: 1 });
  });

  it('C06 — all models fail causes discussion to transition to failed state', async () => {
    const { repository, rounds } = createRepository();
    const transitions: Array<{ from: string; to: string }> = [];
    const failedCalls: string[] = [];

    await expect(
      runConsensusDiscussion({
        discussionId: 'discussion-1',
        actor: { userId: 'u1', source: 'test' },
        onEvent: () => undefined,
        repository,
        promptStore: createPromptStore(),
        client: createAllModelsFailClient(),
        lockAlreadyAcquired: true,
        stateStore: {
          async updateStatus(params) {
            transitions.push({ from: params.from, to: params.to });
            return true;
          },
          async markFailed(params) {
            failedCalls.push(params.discussionId);
            return true;
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
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_LIVE_MODELS',
    });

    expect(rounds[0]).toMatchObject({ roundNumber: 1, status: 'failed' });
    // 失败收尾通过 markFailed 落 failed，调用方随后触发账务 release/refund。
    expect(failedCalls).toEqual(['discussion-1']);
  });

  it('settles billing on success and releases the hold when the discussion fails', async () => {
    const settled: string[] = [];
    const released: string[] = [];
    const billingResolver: BillingResolver = {
      async resolveForDiscussion() {
        return { raw_cost: 0.0004, platform_price: 0.0005 };
      },
      async settle(discussionId) {
        settled.push(discussionId);
      },
      async release(discussionId) {
        released.push(discussionId);
      },
    };

    // 成功路径：settle 被调用，release 不被调用
    const success = createRepository();
    await runConsensusDiscussion({
      discussionId: 'discussion-1',
      actor: { userId: 'u1', source: 'test' },
      onEvent: () => undefined,
      repository: success.repository,
      promptStore: createPromptStore(),
      client: createClient(),
      billingResolver,
      lockAlreadyAcquired: true,
      stateStore: {
        async updateStatus() {
          return true;
        },
        async markFailed() {
          return true;
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
    });

    expect(settled).toEqual(['discussion-1']);
    expect(released).toEqual([]);

    // 失败路径：release 被调用（settle 不再触发）
    const failure = createRepository();
    await expect(
      runConsensusDiscussion({
        discussionId: 'discussion-1',
        actor: { userId: 'u1', source: 'test' },
        onEvent: () => undefined,
        repository: failure.repository,
        promptStore: createPromptStore(),
        client: createAllModelsFailClient(),
        billingResolver,
        lockAlreadyAcquired: true,
        stateStore: {
          async updateStatus() {
            return true;
          },
          async markFailed() {
            return true;
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
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_LIVE_MODELS' });

    expect(released).toEqual(['discussion-1']);
    expect(settled).toEqual(['discussion-1']);
  });

  it('marks a discussion failed when it fails during the summarizing phase (zombie fix)', async () => {
    const base = createRepository();
    const transitions: Array<{ from: string; to: string }> = [];
    const failedCalls: string[] = [];

    // Rounds 1-3 succeed; persistence of the final summary throws while status = 'summarizing'.
    // Before the fix, handleFatalError's fixed-from CAS(streaming->failed) missed and left a zombie.
    const repository: ConsensusRepository = {
      ...base.repository,
      async saveSummary() {
        throw new Error('failed to persist summary');
      },
    };

    await expect(
      runConsensusDiscussion({
        discussionId: 'discussion-1',
        actor: { userId: 'u1', source: 'test' },
        onEvent: () => undefined,
        repository,
        promptStore: createPromptStore(),
        client: createClient(),
        lockAlreadyAcquired: true,
        stateStore: {
          async updateStatus(params) {
            transitions.push({ from: params.from, to: params.to });
            return true;
          },
          async markFailed(params) {
            failedCalls.push(params.discussionId);
            return true;
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
      })
    ).rejects.toThrow('failed to persist summary');

    // Reached the summarizing state, then failed via the atomic markFailed (not a fixed-from CAS).
    expect(transitions.at(-1)).toEqual({ from: 'streaming', to: 'summarizing' });
    expect(failedCalls).toEqual(['discussion-1']);
  });
});

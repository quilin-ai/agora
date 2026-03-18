import { describe, expect, it } from 'vitest';

import {
  renderPromptTemplate,
  runSecretaryRoundSummary,
  runSecretarySummary,
} from '@/lib/orchestrator/secretary';
import type {
  CompletionRequest,
  CompletionResult,
  OpenRouterClient,
  PromptTemplateStore,
} from '@/lib/orchestrator/types';

async function* createFinishedStream(
  result: CompletionResult
): AsyncGenerator<never, CompletionResult, void> {
  for (const value of [] as never[]) {
    yield value;
  }

  return result;
}

describe('secretary', () => {
  it('renders explicit template placeholders when present', () => {
    const prompt = renderPromptTemplate('Topic={{topic}}\nContext={{context}}', {
      topic: 'Launch strategy',
      context: 'Round recap',
    });

    expect(prompt).toContain('Topic=Launch strategy');
    expect(prompt).toContain('Context=Round recap');
  });

  it('parses secretary JSON into the frozen final summary shape', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize the discussion.\nTopic={{topic}}\nContext={{context}}',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete(_request: CompletionRequest) {
        return {
          text: JSON.stringify({
            consensus: [
              {
                content: 'Proceed with a limited beta rollout.',
                supporting_models: ['m1', 'm2'],
                evidence_refs: ['round-1'],
              },
            ],
            disagreements: [],
            recommendation: 'Proceed with a limited beta rollout.',
            confidence: 'medium',
            open_questions: ['How much support coverage is required?'],
            evidence_refs: ['round-1'],
          }),
          usage: { promptTokens: 120, completionTokens: 48 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'Launch strategy',
      context: 'Model A and Model B largely agree.',
      participantModelIds: ['m1', 'm2'],
      promptStore,
      client,
      now: () => new Date('2026-03-17T00:00:00Z'),
    });

    expect(summary.confidence).toBe('medium');
    expect(summary.disclaimer).toContain('AI 模拟审议');
    expect(summary.is_degraded).toBe(false);
  });

  it('retries once when the first completion is invalid JSON', async () => {
    let callCount = 0;
    const prompts: string[] = [];
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete(request: CompletionRequest) {
        callCount += 1;
        prompts.push(request.messages[0]?.content ?? '');

        if (callCount === 1) {
          return {
            text: 'not-json',
            usage: { promptTokens: 10, completionTokens: 5 },
            finishReason: 'stop',
          };
        }

        return {
          text: JSON.stringify({
            consensus: [
              {
                content: 'Proceed with a limited beta rollout.',
                supporting_models: ['m1'],
                evidence_refs: [],
              },
            ],
            disagreements: [],
            recommendation: 'Proceed with a limited beta rollout.',
            confidence: 'low',
            open_questions: [],
            evidence_refs: [],
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'A context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(callCount).toBe(2);
    expect(summary.recommendation).toBe('Proceed with a limited beta rollout.');
    expect(prompts[1]).toContain('上一次你的输出 JSON 格式不正确。请严格按照以下规则重新输出：');
    expect(prompts[1]).toContain('1. 只输出纯 JSON，不要 ```json 标记');
    expect(prompts[1]).toContain('2. 所有字段必须存在');
    expect(prompts[1]).toContain('3. consensus 至少 1 条');
    expect(prompts[1]).toContain('4. disagreements 的 positions 至少 2 个');
    expect(prompts[1]).toContain('5. recommendation 至少 10 个字');
  });

  it('can generate an intermediate round summary with scoped instructions', async () => {
    let capturedPrompt = '';
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.\nTopic={{topic}}\nContext={{context}}',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete(request: CompletionRequest) {
        capturedPrompt = request.messages[0]?.content ?? '';

        return {
          text: JSON.stringify({
            consensus: [
              {
                content: 'The round is converging on a constrained rollout.',
                supporting_models: ['m1'],
                evidence_refs: ['round-1'],
              },
            ],
            disagreements: [],
            recommendation: 'Carry the staged rollout hypothesis into the next round.',
            confidence: 'medium',
            open_questions: ['What evidence should the next round challenge?'],
            evidence_refs: ['round-1'],
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretaryRoundSummary({
      discussionId: 'discussion-1',
      round: 1,
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'Round 1 context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(summary.recommendation).toContain('next round');
    expect(capturedPrompt).toContain('第 1 轮结束后的中间总结');
    expect(capturedPrompt).toContain('不是最终裁决');
  });

  it('falls back to a degraded summary when semantic validation keeps failing', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete() {
        return {
          text: JSON.stringify({
            consensus: [
              {
                content: 'Proceed with the launch.',
                supporting_models: ['unknown-model'],
                evidence_refs: [],
              },
            ],
            disagreements: [],
            recommendation: 'Proceed with the launch carefully.',
            confidence: 'high',
            open_questions: [],
            evidence_refs: [],
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'A context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(summary.is_degraded).toBe(true);
    expect(summary.open_questions[0]).toContain('unknown supporting model');
  });

  it('falls back to a degraded summary when consensus and disagreements are both empty', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete() {
        return {
          text: JSON.stringify({
            consensus: [],
            disagreements: [],
            recommendation: '请先人工检查本轮输出再决定下一步。',
            confidence: 'low',
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'A context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(summary.is_degraded).toBe(true);
    expect(summary.open_questions[0]).toContain('Too small: expected array to have >=1 items');
  });

  it('falls back to a degraded summary when disagreement positions reference unknown models', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete() {
        return {
          text: JSON.stringify({
            consensus: [
              {
                content: '存在明显分歧。',
                supporting_models: ['m1'],
                evidence_refs: ['round-2'],
              },
            ],
            disagreements: [
              {
                topic: '是否立即上线',
                type: 'logic_divergence',
                positions: [
                  {
                    model_id: 'm1',
                    stance: 'for',
                    summary: '建议立刻发布。',
                  },
                  {
                    model_id: 'unknown-model',
                    stance: 'against',
                    summary: '反对立即发布。',
                  },
                ],
                severity: 'high',
              },
            ],
            recommendation: '先补齐分歧验证再做决定。',
            confidence: 'medium',
            open_questions: [],
            evidence_refs: ['round-2'],
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'A context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(summary.is_degraded).toBe(true);
    expect(summary.open_questions[0]).toContain('unknown disagreement model');
  });

  it('falls back to a degraded summary when high confidence is missing evidence', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'consensus',
          role: 'secretary',
          roundType: 'summary',
          content: 'Summarize.',
          isActive: true,
        };
      },
    };
    const client: OpenRouterClient = {
      streamCompletion(): AsyncGenerator<never, CompletionResult, void> {
        return createFinishedStream({
          text: '',
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        });
      },
      async complete() {
        return {
          text: JSON.stringify({
            consensus: [
              {
                content: 'Proceed with the launch.',
                supporting_models: ['m1'],
                evidence_refs: [],
              },
            ],
            disagreements: [],
            recommendation: 'Proceed with the launch carefully.',
            confidence: 'high',
            open_questions: [],
            evidence_refs: [],
          }),
          usage: { promptTokens: 20, completionTokens: 10 },
          finishReason: 'stop',
        };
      },
    };

    const summary = await runSecretarySummary({
      discussionId: 'discussion-1',
      secretaryModelId: 'gpt-4o',
      topic: 'A topic',
      context: 'A context',
      participantModelIds: ['m1'],
      promptStore,
      client,
    });

    expect(summary.is_degraded).toBe(true);
    expect(summary.open_questions[0]).toContain('High-confidence summary must include evidence references');
  });
});

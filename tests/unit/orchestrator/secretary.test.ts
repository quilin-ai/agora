import { describe, expect, it } from 'vitest';

import { renderPromptTemplate, runSecretarySummary } from '@/lib/orchestrator/secretary';
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
          mode: 'summary',
          role: 'secretary',
          roundType: 'all',
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
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'summary',
          role: 'secretary',
          roundType: 'all',
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
        callCount += 1;

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
  });

  it('falls back to a degraded summary when semantic validation keeps failing', async () => {
    const promptStore: PromptTemplateStore = {
      async getActiveTemplate() {
        return {
          id: 'pt-1',
          version: 'v1',
          model: 'gpt-4o',
          mode: 'summary',
          role: 'secretary',
          roundType: 'all',
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
});

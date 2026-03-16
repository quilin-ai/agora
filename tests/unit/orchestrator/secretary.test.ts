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
            consensus: 'Proceed with a limited beta.',
            disagreements: ['Timing for the public rollout remains debated.'],
            recommendation: 'Start with an invite-only release.',
            confidence: 0.81,
            open_questions: ['How much support coverage is required?'],
            evidence_refs: ['round-1', 'round-3'],
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
      promptStore,
      client,
      now: () => new Date('2026-03-17T00:00:00Z'),
    });

    expect(summary.secretary_model).toBe('gpt-4o');
    expect(summary.generated_at).toBe('2026-03-17T00:00:00.000Z');
    expect(summary.token_usage).toEqual({
      prompt_tokens: 120,
      completion_tokens: 48,
    });
    expect(summary.raw_output.confidence).toBe(0.81);
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
            consensus: 'ok',
            disagreements: [],
            recommendation: 'go',
            confidence: 0.8,
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
      promptStore,
      client,
    });

    expect(callCount).toBe(2);
    expect(summary.raw_output.recommendation).toBe('go');
  });
});

import { and, eq, inArray } from 'drizzle-orm';

import type { SecretaryRawOutput } from '@/lib/types';
import { discussionSummaryFinalSchema, secretaryRawOutputSchema } from '@/lib/types/schemas';

import { createOpenRouterClient } from '@/lib/openrouter/client';

import type {
  CompletionResult,
  OpenRouterClient,
  PromptTemplateRecord,
  PromptTemplateStore,
} from './types';
import { buildSecretaryPromptVariables } from './prompt-variables';
import { OrchestratorError, PromptTemplateMissingError } from './types';

export interface RunSecretarySummaryParams {
  discussionId: string;
  secretaryModelId: string;
  topic: string;
  context: string;
  participantModelIds?: string[];
  promptStore?: PromptTemplateStore;
  client?: OpenRouterClient;
  now?: () => Date;
}

export interface RunSecretaryRoundSummaryParams extends RunSecretarySummaryParams {
  round: number;
}

const DEFAULT_DISCLAIMER =
  '⚠️ 本讨论为 AI 模拟审议，不构成财务、法律、医疗或其他专业建议。所有结论仅供参考，最终决策权归用户所有。';

export async function runSecretarySummary(
  params: RunSecretarySummaryParams
) {
  return runSecretarySummaryWithScope({
    ...params,
    scope: {
      kind: 'final',
    },
  });
}

export async function runSecretaryRoundSummary(
  params: RunSecretaryRoundSummaryParams
) {
  return runSecretarySummaryWithScope({
    ...params,
    scope: {
      kind: 'round',
      round: params.round,
    },
  });
}

async function runSecretarySummaryWithScope(
  params: RunSecretarySummaryParams & {
    scope:
      | {
          kind: 'final';
        }
      | {
          kind: 'round';
          round: number;
        };
  }
) {
  const promptStore = params.promptStore ?? (await createDefaultPromptTemplateStore());
  const client = params.client ?? createOpenRouterClient();
  const template = await promptStore.getActiveTemplate({
    modelId: params.secretaryModelId,
    mode: 'consensus',
    role: 'secretary',
    roundType: 'summary',
  });

  if (!template.content.trim()) {
    throw new PromptTemplateMissingError({
      modelId: params.secretaryModelId,
      mode: 'consensus',
      role: 'secretary',
      roundType: 'summary',
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const strictRetry = attempt === 1;
      const completion = await client.complete({
        model: params.secretaryModelId,
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSecretaryPrompt({
              template: template.content,
              topic: params.topic,
              context: params.context,
              discussionId: params.discussionId,
              participantModelIds: params.participantModelIds ?? [],
              strictRetry,
              scope: params.scope,
            }),
          },
        ],
      });

      return parseSecretaryCompletion(completion, params.participantModelIds ?? []);
    } catch (error) {
      lastError = error;
    }
  }

  return buildDegradedSummary({
    topic: params.topic,
    secretaryModelId: params.secretaryModelId,
    cause: lastError,
    round: params.scope.kind === 'round' ? params.scope.round : null,
  });
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>
): string {
  const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? '';
  });

  if (rendered !== template) {
    return rendered;
  }

  return [template.trim(), `Topic:\n${variables.topic}`, `Context:\n${variables.context}`]
    .filter(Boolean)
    .join('\n\n');
}

function parseSecretaryCompletion(completion: CompletionResult, participantModelIds: string[]) {
  const rawOutput = secretaryRawOutputSchema.parse(extractJsonPayload(completion.text));
  validateSummarySemantics(rawOutput, participantModelIds);

  return finalizeSummary(rawOutput, false);
}

function finalizeSummary(rawOutput: SecretaryRawOutput, isDegraded: boolean) {
  return discussionSummaryFinalSchema.parse({
    ...rawOutput,
    disclaimer: DEFAULT_DISCLAIMER,
    is_degraded: isDegraded,
  });
}

function validateSummarySemantics(
  rawOutput: Awaited<ReturnType<typeof secretaryRawOutputSchema.parse>>,
  participantModelIds: string[]
): void {
  const allowedModels = new Set(participantModelIds);

  if (rawOutput.consensus.length === 0 && rawOutput.disagreements.length === 0) {
    throw new OrchestratorError(
      'Secretary output must include consensus or disagreements',
      'SECRETARY_OUTPUT_INVALID'
    );
  }

  for (const point of rawOutput.consensus) {
    for (const modelId of point.supporting_models) {
      if (allowedModels.size > 0 && !allowedModels.has(modelId)) {
        throw new OrchestratorError(
          `Secretary referenced unknown supporting model: ${modelId}`,
          'SECRETARY_OUTPUT_INVALID'
        );
      }
    }
  }

  for (const disagreement of rawOutput.disagreements) {
    for (const position of disagreement.positions) {
      if (allowedModels.size > 0 && !allowedModels.has(position.model_id)) {
        throw new OrchestratorError(
          `Secretary referenced unknown disagreement model: ${position.model_id}`,
          'SECRETARY_OUTPUT_INVALID'
        );
      }
    }
  }

  if (rawOutput.confidence === 'high') {
    const evidenceCount =
      rawOutput.evidence_refs.length +
      rawOutput.consensus.reduce((count, point) => count + point.evidence_refs.length, 0);

    if (evidenceCount < 1) {
      throw new OrchestratorError(
        'High-confidence summary must include evidence references',
        'SECRETARY_OUTPUT_INVALID'
      );
    }
  }
}

function buildSecretaryPrompt(params: {
  template: string;
  topic: string;
  context: string;
  discussionId: string;
  participantModelIds: string[];
  strictRetry: boolean;
  scope:
    | {
        kind: 'final';
      }
    | {
        kind: 'round';
        round: number;
      };
}): string {
  const basePrompt = renderPromptTemplate(
    params.template,
    buildSecretaryPromptVariables({
      topic: params.topic,
      context: params.context,
      discussionId: params.discussionId,
      participantModelIds: params.participantModelIds,
    })
  );
  const scopeInstruction =
    params.scope.kind === 'round'
      ? `你现在输出的是第 ${params.scope.round} 轮结束后的中间总结，不是最终裁决。请提炼当前共识、主要分歧、下一轮必须回答的问题，并给出暂时性 recommendation。`
      : '你现在输出的是整场 3 轮讨论结束后的最终书记员总结。请基于完整上下文给出最终 recommendation、confidence、分歧和待确认问题。';

  if (!params.strictRetry) {
    return [basePrompt, scopeInstruction].join('\n\n');
  }

  return [
    basePrompt,
    scopeInstruction,
    '上一次你的输出 JSON 格式不正确。请严格按照以下规则重新输出：',
    '1. 只输出纯 JSON，不要 ```json 标记',
    '2. 所有字段必须存在',
    '3. consensus 至少 1 条',
    '4. disagreements 的 positions 至少 2 个',
    '5. recommendation 至少 10 个字',
  ].join('\n\n');
}

function buildDegradedSummary(params: {
  topic: string;
  secretaryModelId: string;
  cause: unknown;
  round: number | null;
}) {
  const causeMessage =
    params.cause instanceof Error ? params.cause.message : 'Secretary output validation failed';
  const topicPrefix =
    params.round === null
      ? `关于“${params.topic}”的总结已降级生成`
      : `关于“${params.topic}”的第 ${params.round} 轮中间总结已降级生成`;

  return finalizeSummary(
    {
      consensus: [
        {
          content: `${topicPrefix}，建议人工复核原始讨论记录。`,
          supporting_models: [],
          evidence_refs: [],
        },
      ],
      disagreements: [],
      recommendation: '请人工复核各模型原始输出后再做最终决策。',
      confidence: 'low',
      open_questions: [causeMessage],
      evidence_refs: [],
      decision_boundary: '需结合原始轮次输出进行人工判断。',
    },
    true
  );
}

function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next extraction strategy.
    }
  }

  throw new Error('Secretary response did not contain valid JSON');
}

export async function createDefaultPromptTemplateStore(): Promise<PromptTemplateStore> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async getActiveTemplate(lookup) {
      const records = await db
        .select()
        .from(schema.promptTemplates)
        .where(
          and(
            inArray(schema.promptTemplates.model, [lookup.modelId, 'all']),
            inArray(schema.promptTemplates.mode, [lookup.mode, 'all']),
            inArray(schema.promptTemplates.role, [lookup.role, 'all']),
            inArray(schema.promptTemplates.roundType, [lookup.roundType, 'all']),
            eq(schema.promptTemplates.isActive, true)
          )
        )
        .limit(16);

      const template = records
        .slice()
        .sort((left, right) => scoreTemplate(right, lookup) - scoreTemplate(left, lookup))[0];

      if (!template) {
        throw new PromptTemplateMissingError(lookup);
      }

      return template;
    },
  };
}

function scoreTemplate(
  template: PromptTemplateRecord,
  lookup: {
    modelId: string;
    mode: string;
    role: string;
    roundType: string;
  }
): number {
  return (
    Number(template.model === lookup.modelId) * 8 +
    Number(template.mode === lookup.mode) * 4 +
    Number(template.role === lookup.role) * 2 +
    Number(template.roundType === lookup.roundType)
  );
}

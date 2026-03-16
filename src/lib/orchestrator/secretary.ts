import { and, eq } from 'drizzle-orm';

import { discussionSummaryFinalSchema, secretaryRawOutputSchema } from '@/lib/types/schemas';

import { createOpenRouterClient } from '@/lib/openrouter/client';

import type {
  CompletionResult,
  OpenRouterClient,
  PromptTemplateStore,
} from './types';
import { OrchestratorError, PromptTemplateMissingError } from './types';

export interface RunSecretarySummaryParams {
  discussionId: string;
  secretaryModelId: string;
  topic: string;
  context: string;
  promptStore?: PromptTemplateStore;
  client?: OpenRouterClient;
  now?: () => Date;
}

export async function runSecretarySummary(
  params: RunSecretarySummaryParams
) {
  const promptStore = params.promptStore ?? (await createDefaultPromptTemplateStore());
  const client = params.client ?? createOpenRouterClient();
  const now = params.now ?? (() => new Date());
  const template = await promptStore.getActiveTemplate({
    modelId: params.secretaryModelId,
    mode: 'summary',
    role: 'secretary',
  });

  if (!template.content.trim()) {
    throw new PromptTemplateMissingError({
      modelId: params.secretaryModelId,
      mode: 'summary',
      role: 'secretary',
    });
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = await client.complete({
        model: params.secretaryModelId,
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: renderPromptTemplate(template.content, {
              topic: params.topic,
              context: params.context,
              discussion_id: params.discussionId,
            }),
          },
        ],
      });

      return parseSecretaryCompletion(completion, params.secretaryModelId, now);
    } catch (error) {
      lastError = error;
    }
  }

  throw new OrchestratorError(
    'Secretary output did not match the required JSON schema',
    'SECRETARY_OUTPUT_INVALID',
    lastError
  );
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

function parseSecretaryCompletion(
  completion: CompletionResult,
  secretaryModelId: string,
  now: () => Date
) {
  const rawOutput = secretaryRawOutputSchema.parse(extractJsonPayload(completion.text));

  return discussionSummaryFinalSchema.parse({
    raw_output: rawOutput,
    generated_at: now().toISOString(),
    secretary_model: secretaryModelId,
    token_usage: {
      prompt_tokens: completion.usage.promptTokens,
      completion_tokens: completion.usage.completionTokens,
    },
  });
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
            eq(schema.promptTemplates.model, lookup.modelId),
            eq(schema.promptTemplates.mode, lookup.mode),
            eq(schema.promptTemplates.role, lookup.role),
            eq(schema.promptTemplates.isActive, true)
          )
        )
        .limit(1);

      const template = records[0];

      if (!template) {
        throw new PromptTemplateMissingError(lookup);
      }

      return template;
    },
  };
}

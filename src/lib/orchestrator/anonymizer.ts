import type {
  AnonymizationMapping,
  AnonymizationStore,
} from './types';

export const IDENTITY_PATTERNS = [
  /\b(?:claude|gpt|gemini|llama|qwen|deepseek|grok|openai|anthropic|google|meta)\b/gi,
  /\b(?:ai|assistant|language model)\b/gi,
  /(?:我|i)\s*(?:是|am|作为|as)\s*(?:一个|an?\s+)?(?:ai|assistant|language model|语言模型)/gi,
  /(?:模型|model)\s*(?:身份|id)?\s*[:：]\s*\S+/gi,
] as const;

function toLabelSuffix(index: number): string {
  let current = index + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function createAnonymousLabel(index: number): string {
  return `选手${toLabelSuffix(index)}`;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const cloned = [...values];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = cloned[index];
    cloned[index] = cloned[swapIndex];
    cloned[swapIndex] = current;
  }

  return cloned;
}

export function createAnonymizationMappings(params: {
  discussionId: string;
  modelIds: string[];
  roundNumber?: number;
  random?: () => number;
}): AnonymizationMapping[] {
  const roundNumber = params.roundNumber ?? 2;
  const random = params.random ?? Math.random;
  const shuffledModelIds = shuffle(params.modelIds, random);

  return shuffledModelIds.map((modelId, index) => ({
    discussionId: params.discussionId,
    roundNumber,
    modelId,
    anonymousLabel: createAnonymousLabel(index),
  }));
}

export async function anonymizeModels(params: {
  discussionId: string;
  modelIds: string[];
  roundNumber?: number;
  random?: () => number;
  store?: AnonymizationStore;
}): Promise<AnonymizationMapping[]> {
  const mappings = createAnonymizationMappings(params);
  const store = params.store ?? (await createDefaultAnonymizationStore());

  await store.saveMappings(mappings);

  return mappings;
}

export function anonymizeRoundResponses(
  responses: Array<{ modelId: string; text: string }>,
  mappings: AnonymizationMapping[]
): string {
  return anonymizeRoundResponsesInternal(responses, mappings);
}

export function anonymizeRoundResponsesForReviewer(
  responses: Array<{ modelId: string; text: string }>,
  mappings: AnonymizationMapping[],
  reviewerModelId: string
): string {
  return anonymizeRoundResponsesInternal(responses, mappings, new Set([reviewerModelId]));
}

function anonymizeRoundResponsesInternal(
  responses: Array<{ modelId: string; text: string }>,
  mappings: AnonymizationMapping[],
  excludedModelIds: Set<string> = new Set()
): string {
  const labelByModelId = new Map(mappings.map((mapping) => [mapping.modelId, mapping.anonymousLabel]));
  const allModelIds = mappings.map((mapping) => mapping.modelId);

  return responses
    .filter((response) => !excludedModelIds.has(response.modelId))
    .map((response) => {
      const label = labelByModelId.get(response.modelId) ?? response.modelId;
      return `${label}\n${stripIdentitySignals(response.text, allModelIds)}`.trim();
    })
    .join('\n\n');
}

function stripIdentitySignals(text: string, modelIds: string[]): string {
  const escapedModelIds = modelIds.map((modelId) => escapeRegExp(modelId));
  const dynamicPatterns = escapedModelIds.length
    ? [new RegExp(escapedModelIds.join('|'), 'gi')]
    : [];
  const genericPatterns = [
    ...IDENTITY_PATTERNS,
    /\b(?:我是|i am|as)\b\s*(?:chatgpt|claude|gemini|llama|qwen|deepseek|grok)\b/gi,
  ];

  const sanitized = [...genericPatterns, ...dynamicPatterns].reduce((current, pattern) => {
    return current.replace(pattern, '');
  }, text);

  return sanitized
    .replace(/[`*_>#]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createDefaultAnonymizationStore(): Promise<AnonymizationStore> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async saveMappings(mappings: AnonymizationMapping[]) {
      if (mappings.length === 0) {
        return;
      }

      await db.insert(schema.discussionAnonymizationMaps).values(
        mappings.map((mapping) => ({
          conversationId: mapping.discussionId,
          round: mapping.roundNumber,
          logicalModelId: mapping.modelId,
          label: mapping.anonymousLabel,
        }))
      );
    },
  };
}

import type {
  AnonymizationMapping,
  AnonymizationStore,
} from './types';

// 只剥离「自指身份」句式，绝不做全文关键词消杀：正文里的 "AI"、模型名等
// 讨论内容必须保留（README 主打示例问题本身就含 "AI"）。
export const IDENTITY_PATTERNS = [
  // English self-identification: "I am (an) <identity>" / "I'm <identity>"
  /\bi\s*(?:am|['’]m)\s+(?:an?\s+)?(?:claude|chatgpt|gpt|gemini|llama|qwen|deepseek|grok|openai|anthropic|ai\s+assistant|assistant|large\s+language\s+model|language\s+model|ai)\b/gi,
  // English "as a(n) <identity> ..." self-framing
  /\bas\s+an?\s+(?:ai\s+assistant|ai\s+language\s+model|large\s+language\s+model|language\s+model|assistant|ai)\b/gi,
  // Chinese self-identification: "我是/我作为/作为(一个)<identity>"
  /(?:我是|我作为|作为)\s*(?:一(?:个|款|名))?\s*(?:claude|chatgpt|gpt|gemini|llama|qwen|deepseek|grok|openai|anthropic|ai\s*助手|助手|大语言模型|语言模型|人工智能|ai)/gi,
  // Explicit model-id / identity declaration: "model id: ..." / "模型身份：..."
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
    // 只压行内多余空格，保留换行/段落结构（此前 /\s{2,}/ 会把段落换行也压成单空格）。
    .replace(/[ \t]{2,}/g, ' ')
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

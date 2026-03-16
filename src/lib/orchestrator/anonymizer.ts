import type {
  AnonymizationMapping,
  AnonymizationStore,
} from './types';

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
  return `Model ${toLabelSuffix(index)}`;
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
  const labelByModelId = new Map(mappings.map((mapping) => [mapping.modelId, mapping.anonymousLabel]));

  return responses
    .map((response) => {
      const label = labelByModelId.get(response.modelId) ?? response.modelId;
      return `${label}\n${response.text}`.trim();
    })
    .join('\n\n');
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

import { describe, expect, it } from 'vitest';

import {
  anonymizeModels,
  anonymizeRoundResponses,
  createAnonymizationMappings,
} from '@/lib/orchestrator/anonymizer';
import type { AnonymizationMapping, AnonymizationStore } from '@/lib/orchestrator/types';

describe('anonymizer', () => {
  it('creates stable labels and shuffles model order', () => {
    const mappings = createAnonymizationMappings({
      discussionId: 'discussion-1',
      modelIds: ['m1', 'm2', 'm3'],
      random: () => 0,
    });

    expect(mappings).toHaveLength(3);
    expect(mappings.map((mapping) => mapping.anonymousLabel)).toEqual([
      'Model A',
      'Model B',
      'Model C',
    ]);
    expect(mappings.map((mapping) => mapping.modelId)).toEqual(['m2', 'm3', 'm1']);
  });

  it('persists generated mappings through the injected store', async () => {
    const saved: AnonymizationMapping[][] = [];
    const store: AnonymizationStore = {
      async saveMappings(mappings) {
        saved.push(mappings);
      },
    };

    const mappings = await anonymizeModels({
      discussionId: 'discussion-1',
      modelIds: ['m1', 'm2'],
      random: () => 0.9,
      store,
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(mappings);
  });

  it('replaces model ids with anonymous labels in review context', () => {
    const context = anonymizeRoundResponses(
      [
        { modelId: 'm1', text: 'First answer' },
        { modelId: 'm2', text: 'Second answer' },
      ],
      [
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm1',
          anonymousLabel: 'Model B',
        },
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm2',
          anonymousLabel: 'Model A',
        },
      ]
    );

    expect(context).toContain('Model B');
    expect(context).toContain('Model A');
    expect(context).not.toContain('m1');
    expect(context).not.toContain('m2');
  });
});

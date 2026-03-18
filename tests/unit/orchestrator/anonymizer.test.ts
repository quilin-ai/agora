import { describe, expect, it } from 'vitest';

import {
  IDENTITY_PATTERNS,
  anonymizeModels,
  anonymizeRoundResponses,
  anonymizeRoundResponsesForReviewer,
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
      '选手A',
      '选手B',
      '选手C',
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
        {
          modelId: 'openai/gpt-5-nano',
          text: '我作为 Claude assistant 支持这个方案。\nopenai/gpt-5-nano 也给出相同判断。',
        },
        { modelId: 'm2', text: 'Second answer' },
      ],
      [
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'openai/gpt-5-nano',
          anonymousLabel: '选手B',
        },
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm2',
          anonymousLabel: '选手A',
        },
      ]
    );

    expect(context).toContain('选手B');
    expect(context).toContain('选手A');
    expect(context).not.toContain('openai/gpt-5-nano');
    expect(context).not.toContain('m2');
    expect(context).not.toMatch(/claude|assistant/i);
  });

  it('excludes the reviewer from anonymous review context', () => {
    const context = anonymizeRoundResponsesForReviewer(
      [
        { modelId: 'm1', text: 'Self answer' },
        { modelId: 'm2', text: 'Peer answer A' },
        { modelId: 'm3', text: 'Peer answer B' },
      ],
      [
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm1',
          anonymousLabel: '选手A',
        },
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm2',
          anonymousLabel: '选手B',
        },
        {
          discussionId: 'discussion-1',
          roundNumber: 2,
          modelId: 'm3',
          anonymousLabel: '选手C',
        },
      ],
      'm1'
    );

    expect(context).not.toContain('Self answer');
    expect(context).not.toContain('选手A');
    expect(context).toContain('选手B');
    expect(context).toContain('Peer answer A');
    expect(context).toContain('选手C');
    expect(context).toContain('Peer answer B');
  });

  it('exposes identity stripping patterns for self-identification phrases', () => {
    const samples = [
      'I am an AI assistant.',
      '我是一个语言模型。',
      'model id: anthropic/claude-sonnet-4.6',
    ];

    expect(
      samples.every((sample) =>
        IDENTITY_PATTERNS.some((pattern) => new RegExp(pattern.source, pattern.flags).test(sample))
      )
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildRoundPromptVariables,
  buildSecretaryPromptVariables,
} from '@/lib/orchestrator/prompt-variables';

describe('prompt variables', () => {
  it('maps review and rebuttal context into the frozen placeholder names', () => {
    const review = buildRoundPromptVariables({
      discussionId: 'discussion-1',
      topic: 'Launch strategy',
      context: 'Anonymous round one recap',
      roundType: 'review',
    });
    const rebuttal = buildRoundPromptVariables({
      discussionId: 'discussion-1',
      topic: 'Launch strategy',
      context: 'Compressed context',
      roundType: 'rebuttal',
    });

    expect(review.anonymized_round1_texts).toBe('Anonymous round one recap');
    expect(review.compressed_context).toBe('');
    expect(rebuttal.anonymized_round1_texts).toBe('');
    expect(rebuttal.compressed_context).toBe('Compressed context');
  });

  it('builds secretary variables for the consensus prompt seed shape', () => {
    const variables = buildSecretaryPromptVariables({
      discussionId: 'discussion-1',
      topic: 'Launch strategy',
      context: 'Round 1 and round 2 recap',
      participantModelIds: ['m1', 'm2', 'm3'],
    });

    expect(variables.participating_models).toBe('m1, m2, m3');
    expect(variables.compressed_rounds).toBe('Round 1 and round 2 recap');
  });
});

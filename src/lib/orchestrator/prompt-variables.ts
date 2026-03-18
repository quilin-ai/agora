import type { RoundType } from '@/lib/types';

export function buildRoundPromptVariables(params: {
  topic: string;
  context: string;
  discussionId: string;
  roundType: RoundType;
  roleDescription?: string;
}): Record<string, string> {
  return {
    topic: params.topic,
    context: params.context,
    discussion_id: params.discussionId,
    role_description: params.roleDescription ?? '',
    anonymized_round1_texts: params.roundType === 'review' ? params.context : '',
    compressed_context: params.roundType === 'rebuttal' ? params.context : '',
  };
}

export function buildSecretaryPromptVariables(params: {
  topic: string;
  context: string;
  discussionId: string;
  participantModelIds: string[];
}): Record<string, string> {
  const participatingModels = params.participantModelIds.join(', ');

  return {
    topic: params.topic,
    context: params.context,
    discussion_id: params.discussionId,
    participating_models: participatingModels,
    compressed_rounds: params.context,
  };
}

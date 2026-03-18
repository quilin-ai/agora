import type { CompressedRoundState } from '@/lib/types';
import { compressedRoundStateSchema } from '@/lib/types/schemas';

import type { RoundModelResponse } from './types';

const MAX_CORE_STANCE_LENGTH = 120;
const MAX_EVIDENCE_ITEMS = 3;
const MAX_CONFLICT_ITEMS = 4;
const MAX_INFORMATION_ITEMS = 6;

export function compressRoundState(params: {
  round: number;
  responses: RoundModelResponse[];
  previousStates?: CompressedRoundState[];
}): CompressedRoundState {
  const candidate = buildCompressedRoundState(params);

  try {
    validateCompressedRoundState(candidate);
    return candidate;
  } catch {
    const fallback = buildHeavierCompressedRoundState(params);
    validateCompressedRoundState(fallback);
    return fallback;
  }
}

export function mergeCompressedStates(states: CompressedRoundState[]): CompressedRoundState {
  if (states.length === 0) {
    return validateCompressedRoundState({
      round: 0,
      model_positions: [],
      unresolved_conflicts: [],
      new_information: [],
      must_answer_in_next_round: [],
    });
  }

  const latestByModel = new Map<string, CompressedRoundState['model_positions'][number]>();

  for (const state of states) {
    for (const position of state.model_positions) {
      latestByModel.set(position.logical_model_id, position);
    }
  }

  return validateCompressedRoundState({
    round: Math.max(...states.map((state) => state.round)),
    model_positions: Array.from(latestByModel.values()),
    unresolved_conflicts: dedupe(states.flatMap((state) => state.unresolved_conflicts)).slice(
      0,
      MAX_CONFLICT_ITEMS
    ),
    new_information: dedupe(states.flatMap((state) => state.new_information)).slice(
      0,
      MAX_INFORMATION_ITEMS
    ),
    must_answer_in_next_round: dedupe(
      states.flatMap((state) => state.must_answer_in_next_round)
    ).slice(0, MAX_CONFLICT_ITEMS),
  });
}

export function serializeCompressedState(state: CompressedRoundState): string {
  return JSON.stringify(state, null, 2);
}

export function serializeCompressedStates(states: CompressedRoundState[]): string {
  return JSON.stringify(states, null, 2);
}

function buildCompressedRoundState(params: {
  round: number;
  responses: RoundModelResponse[];
  previousStates?: CompressedRoundState[];
}): CompressedRoundState {
  const modelPositions = params.responses.map((response) => ({
    logical_model_id: response.modelId,
    core_stance: summarizeCoreStance(response.text),
    key_evidence: extractEvidence(response.text),
    challenged_by: extractChallengeTargets(response.text, params.responses, response.modelId),
    conceded_points: extractConcessions(response.text),
  }));
  const unresolvedConflicts = dedupe(
    modelPositions
      .filter((position) => position.challenged_by.length > 0)
      .map((position) => `${position.logical_model_id} received direct challenges`)
  ).slice(0, MAX_CONFLICT_ITEMS);
  const inheritedQuestions = dedupe(
    params.previousStates?.flatMap((state) => state.must_answer_in_next_round) ?? []
  );
  const mustAnswer = dedupe([...inheritedQuestions, ...unresolvedConflicts]).slice(
    0,
    MAX_CONFLICT_ITEMS
  );

  return {
    round: params.round,
    model_positions: modelPositions,
    unresolved_conflicts: unresolvedConflicts,
    new_information: dedupe(modelPositions.flatMap((position) => position.key_evidence)).slice(
      0,
      MAX_INFORMATION_ITEMS
    ),
    must_answer_in_next_round: mustAnswer,
  };
}

function buildHeavierCompressedRoundState(params: {
  round: number;
  responses: RoundModelResponse[];
  previousStates?: CompressedRoundState[];
}): CompressedRoundState {
  const inheritedQuestions = dedupe(
    params.previousStates?.flatMap((state) => state.must_answer_in_next_round) ?? []
  );

  return {
    round: params.round,
    model_positions: params.responses.map((response) => ({
      logical_model_id: response.modelId,
      core_stance: response.text.trim().slice(0, MAX_CORE_STANCE_LENGTH) || 'See raw response excerpt',
      key_evidence: collectSentences(response.text).slice(0, MAX_EVIDENCE_ITEMS),
      challenged_by: [],
      conceded_points: [],
    })),
    unresolved_conflicts: inheritedQuestions.slice(0, MAX_CONFLICT_ITEMS),
    new_information: dedupe(
      params.responses.flatMap((response) => collectSentences(response.text).slice(0, 2))
    ).slice(0, MAX_INFORMATION_ITEMS),
    must_answer_in_next_round: inheritedQuestions.slice(0, MAX_CONFLICT_ITEMS),
  };
}

function validateCompressedRoundState(state: CompressedRoundState): CompressedRoundState {
  const parsed = compressedRoundStateSchema.parse(state);

  for (const position of parsed.model_positions) {
    if (!position.core_stance.trim()) {
      throw new Error(`CompressedRoundState.core_stance is empty for ${position.logical_model_id}`);
    }
  }

  if (parsed.unresolved_conflicts.length > 0 && parsed.must_answer_in_next_round.length === 0) {
    throw new Error('must_answer_in_next_round is required when unresolved_conflicts is non-empty');
  }

  return parsed;
}

function summarizeCoreStance(text: string): string {
  const sentences = collectSentences(text);
  const firstSubstantiveSentence = sentences.find((sentence) => sentence.length >= 12) ?? sentences[0] ?? '';

  return firstSubstantiveSentence.slice(0, MAX_CORE_STANCE_LENGTH).trim();
}

function extractEvidence(text: string): string[] {
  const sentences = collectSentences(text);
  const numericSentences = sentences.filter((sentence) => /\d/.test(sentence));
  const selected = numericSentences.length > 0 ? numericSentences : sentences;

  return dedupe(selected.map((sentence) => sentence.slice(0, 160).trim())).slice(0, MAX_EVIDENCE_ITEMS);
}

function extractChallengeTargets(
  text: string,
  responses: RoundModelResponse[],
  currentModelId: string
): string[] {
  const lowered = text.toLowerCase();

  return responses
    .filter((response) => response.modelId !== currentModelId)
    .map((response) => response.modelId)
    .filter((modelId) => lowered.includes(modelId.toLowerCase()) || /不同意|质疑|反驳|disagree|challenge/i.test(text))
    .slice(0, MAX_CONFLICT_ITEMS);
}

function extractConcessions(text: string): string[] {
  return collectSentences(text)
    .filter((sentence) => /承认|改变了我的想法|concede|changed my mind|我同意/i.test(sentence))
    .slice(0, MAX_EVIDENCE_ITEMS);
}

function collectSentences(text: string): string[] {
  return text
    .split(/[\n。！？!?]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

import { describe, expect, it } from 'vitest';

import {
  compressRoundState,
  mergeCompressedStates,
  serializeCompressedState,
  serializeCompressedStates,
} from '@/lib/orchestrator/context-manager';
import type { RoundModelResponse } from '@/lib/orchestrator/types';

function createResponse(modelId: string, text: string): RoundModelResponse {
  return {
    modelId,
    actualModelId: modelId,
    round: 1,
    text,
    inputTokens: 100,
    outputTokens: 50,
    rawCost: 0.0001,
    ttftMs: 100,
    latencyMs: 500,
  };
}

describe('context-manager', () => {
  it('builds a valid CompressedRoundState and preserves numeric evidence', () => {
    const state = compressRoundState({
      round: 2,
      responses: [
        createResponse(
          'm1',
          '我支持方案A。预计成本下降 23%，并能在 14 天内完成迁移。'
        ),
        createResponse(
          'm2',
          '我不同意方案A。当前 SLA 只有 99.5%，不足以支撑生产发布。'
        ),
      ],
      previousStates: [],
    });

    expect(state.round).toBe(2);
    expect(state.model_positions).toHaveLength(2);
    expect(state.model_positions[0]?.key_evidence.some((item) => item.includes('23%'))).toBe(true);
    expect(state.model_positions[1]?.key_evidence.some((item) => item.includes('99.5%'))).toBe(true);
  });

  it('falls back to a heavier context when strict validation would fail', () => {
    const state = compressRoundState({
      round: 3,
      responses: [
        createResponse('m1', '短'),
        createResponse('m2', '也很短'),
      ],
      previousStates: [
        {
          round: 2,
          model_positions: [
            {
              logical_model_id: 'm1',
              core_stance: '保留更多原文证据',
              key_evidence: ['前一轮存在未解决冲突'],
              challenged_by: [],
              conceded_points: [],
            },
          ],
          unresolved_conflicts: ['m1 received direct challenges'],
          new_information: ['前一轮存在未解决冲突'],
          must_answer_in_next_round: ['m1 received direct challenges'],
        },
      ],
    });

    expect(state.model_positions[0]?.core_stance.length).toBeGreaterThan(0);
    expect(state.must_answer_in_next_round).toContain('m1 received direct challenges');
  });

  it('merges compressed states and serializes them as JSON', () => {
    const first = compressRoundState({
      round: 1,
      responses: [createResponse('m1', '方案A在 7 天内完成。')],
      previousStates: [],
    });
    const second = compressRoundState({
      round: 2,
      responses: [createResponse('m1', '我承认 7 天的估计过于乐观，但仍建议推进。')],
      previousStates: [first],
    });

    const merged = mergeCompressedStates([first, second]);

    expect(merged.round).toBe(2);
    expect(serializeCompressedState(merged)).toContain('"round": 2');
    expect(serializeCompressedStates([first, second])).toContain('"round": 1');
    expect(serializeCompressedStates([first, second])).toContain('"round": 2');
  });
});

/**
 * Round 3 rebuttal 上下文构建测试（fix/council-quality）
 * 验证 round 3 拿到的是 round-2 匿名真实全文（除本人外）+ round-1 压缩摘要，
 * 而不是失真的正则启发式合并摘要；并做长度预算保护。
 *
 * 注意：本文件不 mock anonymizer，使用真实剥离/匿名逻辑。
 */

import { describe, expect, it } from 'vitest';

import { buildRebuttalContext, REBUTTAL_ROUND2_CHAR_BUDGET } from '@/lib/orchestrator/consensus';
import type { AnonymizationMapping, RoundModelResponse } from '@/lib/orchestrator/types';

function round2Response(modelId: string, text: string): RoundModelResponse {
  return {
    modelId,
    actualModelId: modelId,
    round: 2,
    text,
    inputTokens: 1,
    outputTokens: 1,
    rawCost: 0,
    ttftMs: null,
    latencyMs: 0,
  };
}

const mappings: AnonymizationMapping[] = [
  { discussionId: 'd', roundNumber: 2, modelId: 'm1', anonymousLabel: '选手A' },
  { discussionId: 'd', roundNumber: 2, modelId: 'm2', anonymousLabel: '选手B' },
];

describe('buildRebuttalContext', () => {
  it('includes anonymized round-2 full text (excluding self) plus the round-1 summary', () => {
    const ctx = buildRebuttalContext({
      round2Responses: [
        round2Response('m1', 'm1 认为方案 A 风险过高。'),
        round2Response('m2', 'm2 反驳：数据表明成本下降 23%，值得推进。'),
      ],
      mappings,
      reviewerModelId: 'm1',
      round1Summary: 'ROUND1_SUMMARY_MARKER',
    });

    // 同伴 m2 以匿名标签出现，且是 round-2 真实原文（含 23%），不是失真摘要
    expect(ctx).toContain('选手B');
    expect(ctx).toContain('成本下降 23%');
    // 评审者本人（m1）的观点被排除
    expect(ctx).not.toContain('选手A');
    // 模型 id 被剥离
    expect(ctx).not.toContain('m2');
    // round-1 压缩摘要一并携带
    expect(ctx).toContain('ROUND1_SUMMARY_MARKER');
  });

  it('truncates round-2 text to the char budget but keeps the round-1 summary', () => {
    const huge = 'x'.repeat(REBUTTAL_ROUND2_CHAR_BUDGET + 500);
    const ctx = buildRebuttalContext({
      round2Responses: [
        round2Response('m1', 'self'),
        round2Response('m2', huge),
      ],
      mappings,
      reviewerModelId: 'm1',
      round1Summary: 'ROUND1_SUMMARY_MARKER',
    });

    expect(ctx).toContain('已按长度预算截断');
    expect(ctx).toContain('ROUND1_SUMMARY_MARKER');
    expect(ctx).not.toContain(huge);
  });
});

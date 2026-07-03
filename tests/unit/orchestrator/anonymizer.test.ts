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

  it('strips self-identification and model ids but preserves generic content', () => {
    const context = anonymizeRoundResponses(
      [
        {
          modelId: 'openai/gpt-5-nano',
          text: '我作为 Claude，我认为应该优先做 CLI。\n这是一个关于 AI 工具的判断。\nopenai/gpt-5-nano 给出相同结论。',
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
    // 模型 id 与自指身份被剥离
    expect(context).not.toContain('openai/gpt-5-nano');
    expect(context).not.toContain('m2');
    expect(context).not.toMatch(/claude/i);
    // 但正文关键词与真实内容必须保留（此前 blanket 消杀会把这些一起删掉）
    expect(context).toContain('AI 工具');
    expect(context).toContain('优先做 CLI');
  });

  it('preserves paragraph newlines instead of collapsing them into a single space', () => {
    const context = anonymizeRoundResponses(
      [
        {
          modelId: 'm1',
          text: '第一段观点。\n第二段观点，含 AI 与 assistant 等正文词汇。',
        },
        { modelId: 'm2', text: '另一位的观点。' },
      ],
      [
        { discussionId: 'd', roundNumber: 2, modelId: 'm1', anonymousLabel: '选手A' },
        { discussionId: 'd', roundNumber: 2, modelId: 'm2', anonymousLabel: '选手B' },
      ]
    );

    // 换行保留：第一段与第二段之间仍是 \n，而不是被压成一个空格
    expect(context).toMatch(/第一段观点。\n第二段观点/);
    // 正文里的 AI / assistant 不再被消杀
    expect(context).toContain('AI');
    expect(context).toContain('assistant');
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

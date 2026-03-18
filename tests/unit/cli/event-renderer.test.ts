import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createCliEventRenderer,
  createCliEventRendererWithOptions,
  formatCliElapsedMs,
  formatCliPhaseLabel,
} from '@/cli/display';

function stripAnsi(text: string): string {
  let output = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '\u001B' && text[index + 1] === '[') {
      index += 2;

      while (index < text.length) {
        const code = text.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
        index += 1;
      }

      continue;
    }

    output += char;
  }

  return output;
}

function getDisplayWidth(text: string): number {
  let width = 0;

  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isWide =
      codePoint >= 0x1100 &&
      (
        codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
        (codePoint >= 0x1f300 && codePoint <= 0x1faf6) ||
        (codePoint >= 0x20000 && codePoint <= 0x3fffd)
      );

    width += isWide ? 2 : 1;
  }

  return width;
}

describe('cli event renderer helpers', () => {
  it('formats known phase labels into readable text', () => {
    expect(formatCliPhaseLabel('independent')).toBe('independent analysis');
    expect(formatCliPhaseLabel('round_summary')).toBe('inter-round secretary summary');
    expect(formatCliPhaseLabel('summarizing')).toBe('secretary summary');
    expect(formatCliPhaseLabel('custom_phase')).toBe('custom phase');
  });

  it('formats elapsed milliseconds for short and long durations', () => {
    expect(formatCliElapsedMs(4_250)).toBe('4.3s');
    expect(formatCliElapsedMs(65_400)).toBe('1m 5.4s');
  });
});

describe('createCliEventRenderer', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => {
    logSpy.mockClear();
  });

  it('renders human-friendly stage labels', () => {
    const renderer = createCliEventRenderer();

    renderer.render({
      type: 'progress',
      data: {
        round: 1,
        total_rounds: 3,
        phase: 'independent',
        seq: 1,
      },
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[stage] Round 1/3 - independent analysis'));
  });

  it('renders compact round completion summary with duration', () => {
    let nowMs = 1_000;
    const renderer = createCliEventRendererWithOptions({
      now: () => nowMs,
    });

    renderer.render({
      type: 'progress',
      data: {
        round: 2,
        total_rounds: 3,
        phase: 'review',
        seq: 1,
      },
    });

    nowMs = 5_600;
    renderer.render({
      type: 'round_done',
      data: {
        round: 2,
        completed_models: ['m1', 'm2'],
        skipped_models: ['m3'],
        failed_models: [
          {
            logical_model_id: 'm3',
            actual_model_id: 'm3',
            error_type: 'timeout',
            action: 'skipped',
          },
        ],
        total_models: 3,
        seq: 2,
      },
    });

    expect(logSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('[round_done] r2 completed=2/3 skipped=1 failed=1 duration=4.6s')
    );
  });

  it('buffers model chunks until that model completes', () => {
    const writes: string[] = [];
    const logs: unknown[][] = [];
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
      },
      log: (...args: unknown[]) => {
        logs.push(args);
      },
    });

    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'deepseek/deepseek-chat',
        actual_model_id: 'deepseek/deepseek-chat',
        round: 1,
        content: 'hello ',
        done: false,
        seq: 1,
      },
    });
    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'z-ai/glm-4.5-air',
        actual_model_id: 'z-ai/glm-4.5-air',
        round: 1,
        content: 'other',
        done: false,
        seq: 2,
      },
    });

    expect(writes).toEqual([]);

    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'deepseek/deepseek-chat',
        actual_model_id: 'deepseek/deepseek-chat',
        round: 1,
        content: 'world',
        done: false,
        seq: 3,
      },
    });
    renderer.render({
      type: 'model_done',
      data: {
        logical_model_id: 'z-ai/glm-4.5-air',
        actual_model_id: 'z-ai/glm-4.5-air',
        round: 1,
        tokens: {
          input: 10,
          output: 20,
        },
        seq: 4,
      },
    });

    expect(writes.join('')).toContain('[round 1] z-ai/glm-4.5-air');
    expect(writes.join('')).toContain('other');
    expect(writes.join('')).not.toContain('hello world');

    renderer.render({
      type: 'model_done',
      data: {
        logical_model_id: 'deepseek/deepseek-chat',
        actual_model_id: 'deepseek/deepseek-chat',
        round: 1,
        tokens: {
          input: 11,
          output: 21,
        },
        seq: 5,
      },
    });

    expect(writes.join('')).toContain('[round 1] deepseek/deepseek-chat');
    expect(writes.join('')).toContain('hello world');
    expect(logs.flat().some((value) => String(value).includes('[model_done] deepseek/deepseek-chat r1'))).toBe(true);
  });

  it('prints a round recap after round completion', () => {
    const writes: string[] = [];
    const logs: unknown[][] = [];
    let nowMs = 1_000;
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
      },
      log: (...args: unknown[]) => {
        logs.push(args);
      },
      now: () => nowMs,
    });

    renderer.render({
      type: 'progress',
      data: {
        round: 2,
        total_rounds: 3,
        phase: 'review',
        seq: 1,
      },
    });
    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'm1',
        actual_model_id: 'm1',
        round: 2,
        content: '第一段完整内容。第二句不会进入预览。',
        done: false,
        seq: 2,
      },
    });
    renderer.render({
      type: 'model_done',
      data: {
        logical_model_id: 'm1',
        actual_model_id: 'm1',
        round: 2,
        tokens: {
          input: 1,
          output: 2,
        },
        seq: 3,
      },
    });

    nowMs = 5_200;
    renderer.render({
      type: 'round_done',
      data: {
        round: 2,
        completed_models: ['m1'],
        skipped_models: [],
        failed_models: [],
        total_models: 1,
        seq: 4,
      },
    });

    const flattenedLogs = logs.flat().map((value) => String(value));
    expect(flattenedLogs.some((line) => line.includes('[round_recap] r2'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('- m1: 第一段完整内容。'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('duration=4.2s'))).toBe(true);
    expect(writes.join('')).toContain('[round 2] m1');
  });

  it('renders an inter-round secretary summary between rounds', () => {
    const logs: unknown[][] = [];
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        isTTY: false,
        write() {
          return true;
        },
      },
      log: (...args: unknown[]) => {
        logs.push(args);
      },
    });

    renderer.render({
      type: 'round_summary',
      data: {
        round: 1,
        consensus: [
          {
            content: 'Round one mostly agrees on a staged rollout.',
            supporting_models: ['m1'],
            evidence_refs: ['round-1'],
          },
        ],
        disagreements: [],
        recommendation: 'Keep the staged rollout frame for round two.',
        confidence: 'medium',
        open_questions: ['Which evidence should be challenged next?'],
        evidence_refs: ['round-1'],
        disclaimer: 'Generated by secretary.',
        is_degraded: false,
        next_round: 2,
        seq: 2,
      },
    });

    const flattenedLogs = logs.flat().map((value) => String(value));
    expect(flattenedLogs.some((line) => line.includes('[round_summary r1]'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('recommendation: Keep the staged rollout frame for round two.'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('open_questions: Which evidence should be challenged next?'))).toBe(true);
  });

  it('renders live panel regions per model in TTY mode', () => {
    const writes: string[] = [];
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        isTTY: true,
        columns: 72,
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
      },
      getPanelModelIds: () => ['m1', 'm2'],
      log: () => {},
      error: () => {},
    });

    renderer.render({
      type: 'progress',
      data: {
        round: 1,
        total_rounds: 3,
        phase: 'independent',
        seq: 1,
      },
    });
    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'm1',
        actual_model_id: 'm1',
        round: 1,
        content: 'hello panel world',
        done: false,
        seq: 2,
      },
    });

    const output = writes.join('');
    expect(output).toContain('[live] Round 1 - independent analysis');
    expect(output).toContain('m1');
    expect(output).toContain('m2');
    expect(output).toContain('hello panel world');
    expect(output).toContain('\x1b[');
  });

  it('exits panel mode before printing a round summary block in TTY mode', () => {
    const writes: string[] = [];
    const logs: unknown[][] = [];
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        isTTY: true,
        columns: 72,
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
      },
      getPanelModelIds: () => ['m1', 'm2'],
      log: (...args: unknown[]) => {
        logs.push(args);
      },
      error: () => {},
    });

    renderer.render({
      type: 'progress',
      data: {
        round: 1,
        total_rounds: 3,
        phase: 'independent',
        seq: 1,
      },
    });
    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'm1',
        actual_model_id: 'm1',
        round: 1,
        content: 'hello panel world',
        done: false,
        seq: 2,
      },
    });
    renderer.render({
      type: 'round_summary',
      data: {
        round: 1,
        consensus: [
          {
            content: 'The first round is converging.',
            supporting_models: ['m1'],
            evidence_refs: ['round-1'],
          },
        ],
        disagreements: [],
        recommendation: 'Move into anonymous review.',
        confidence: 'medium',
        open_questions: [],
        evidence_refs: ['round-1'],
        disclaimer: 'Generated by secretary.',
        is_degraded: false,
        next_round: 2,
        seq: 3,
      },
    });

    const flattenedLogs = logs.flat().map((value) => String(value));
    expect(flattenedLogs.some((line) => line.includes('[round_summary r1]'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('Move into anonymous review.'))).toBe(true);
    expect(flattenedLogs.some((line) => line.includes('next_round: 2'))).toBe(true);
    expect(writes.join('')).toContain('[live] Round 1 - independent analysis');
    expect(writes.join('')).toContain('│ hello panel world');
  });

  it('keeps panel lines within terminal width for CJK streaming text', () => {
    const writes: string[] = [];
    const renderer = createCliEventRendererWithOptions({
      stdout: {
        isTTY: true,
        columns: 40,
        write(chunk: string) {
          writes.push(chunk);
          return true;
        },
      },
      getPanelModelIds: () => ['qwen/qwen3.5-9b'],
      log: () => {},
      error: () => {},
    });

    renderer.render({
      type: 'progress',
      data: {
        round: 1,
        total_rounds: 3,
        phase: 'independent',
        seq: 1,
      },
    });
    renderer.render({
      type: 'chunk',
      data: {
        logical_model_id: 'qwen/qwen3.5-9b',
        actual_model_id: 'qwen/qwen3.5-9b',
        round: 1,
        content:
          '中国跨境电商年增速超20%，中小卖家极度依赖效率工具，现有选品工具普遍缺乏本土化AI支持。',
        done: false,
        seq: 2,
      },
    });

    const lines = writes
      .join('')
      .split('\n')
      .map((line) => stripAnsi(line.replace(/\r/g, '')))
      .filter((line) => line.length > 0);

    expect(lines.every((line) => getDisplayWidth(line) <= 40)).toBe(true);
  });
});

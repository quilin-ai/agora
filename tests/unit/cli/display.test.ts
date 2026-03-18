import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCliStatusIndicator } from '@/cli/display';

describe('createCliStatusIndicator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders spinner frames and completion output in TTY mode', () => {
    vi.useFakeTimers();

    const writes: string[] = [];
    const stream = {
      isTTY: true,
      write(chunk: string) {
        writes.push(chunk);
        return true;
      },
    };

    let nowMs = 0;
    const indicator = createCliStatusIndicator({
      stream,
      now: () => nowMs,
      intervalMs: 100,
    });

    indicator.start('Waiting for first token');
    nowMs = 100;
    vi.advanceTimersByTime(100);
    nowMs = 250;
    indicator.succeed('First token received');

    expect(writes.some((chunk) => chunk.includes('[wait] Waiting for first token'))).toBe(true);
    expect(writes.some((chunk) => chunk.includes('[ready] First token received'))).toBe(true);
    expect(writes.at(-1)).toContain('(0.3s)');
  });

  it('prints start and error messages in non-TTY mode', () => {
    const writes: string[] = [];
    const stream = {
      isTTY: false,
      write(chunk: string) {
        writes.push(chunk);
        return true;
      },
    };

    let nowMs = 0;
    const indicator = createCliStatusIndicator({
      stream,
      now: () => nowMs,
    });

    indicator.start('Waiting for first token');
    nowMs = 850;
    indicator.fail('Request failed');

    expect(writes[0]).toContain('[wait] Waiting for first token');
    expect(writes[1]).toContain('[error] Request failed');
    expect(writes[1]).toMatch(/\(0\.[89]s\)/);
  });

  it('advances milestone messages in TTY mode', () => {
    vi.useFakeTimers();

    const writes: string[] = [];
    const stream = {
      isTTY: true,
      write(chunk: string) {
        writes.push(chunk);
        return true;
      },
    };

    let nowMs = 0;
    const indicator = createCliStatusIndicator({
      stream,
      now: () => nowMs,
      intervalMs: 100,
    });

    indicator.start('Sending request', {
      milestones: [
        { afterMs: 300, message: 'Model is thinking' },
        { afterMs: 800, message: 'Still waiting for first token' },
      ],
    });

    nowMs = 350;
    vi.advanceTimersByTime(400);
    nowMs = 850;
    vi.advanceTimersByTime(500);
    indicator.succeed('First token received');

    expect(writes.some((chunk) => chunk.includes('Sending request'))).toBe(true);
    expect(writes.some((chunk) => chunk.includes('Model is thinking'))).toBe(true);
    expect(writes.some((chunk) => chunk.includes('Still waiting for first token'))).toBe(true);
  });

  it('supports explicit status updates while active', () => {
    const writes: string[] = [];
    const stream = {
      isTTY: false,
      write(chunk: string) {
        writes.push(chunk);
        return true;
      },
    };

    let nowMs = 0;
    const indicator = createCliStatusIndicator({
      stream,
      now: () => nowMs,
    });

    indicator.start('Checking runtime');
    nowMs = 200;
    indicator.update('Loading configuration');
    nowMs = 450;
    indicator.succeed('Ready');

    expect(writes[0]).toContain('[wait] Checking runtime');
    expect(writes[1]).toContain('[wait] Loading configuration');
    expect(writes[2]).toContain('[ready] Ready');
  });
});

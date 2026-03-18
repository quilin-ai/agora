import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEventLogger } from '@/cli/event-logger';

describe('EventLogger', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `agora-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates logger and writes JSONL to correct path', async () => {
    const logger = await createEventLogger({
      discussionId: 'test-discussion',
      baseDir: testDir,
    });

    expect(logger.getFilePath()).toBe(join(testDir, 'test-discussion.events.jsonl'));

    await logger.log({ type: 'progress', data: { round: 1 } });

    const content = await readFile(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('progress');
    expect(parsed.data).toEqual({ round: 1 });
    expect(parsed.timestamp).toBeDefined();
  });

  it('appends multiple events without overwriting', async () => {
    const logger = await createEventLogger({
      discussionId: 'append-test',
      baseDir: testDir,
    });

    await logger.log({ type: 'progress', data: { round: 1 } });
    await logger.log({ type: 'chunk', data: { text: 'hello' } });
    await logger.log({ type: 'round_done', data: { round: 1 } });

    const content = await readFile(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);

    expect(JSON.parse(lines[0]).type).toBe('progress');
    expect(JSON.parse(lines[1]).type).toBe('chunk');
    expect(JSON.parse(lines[2]).type).toBe('round_done');
  });

  it('rejects invalid event type', async () => {
    const logger = await createEventLogger({
      discussionId: 'reject-test',
      baseDir: testDir,
    });

    await expect(
      logger.log({ type: 'invalid_type', data: {} })
    ).rejects.toThrow('Invalid event type');
  });

  it('rejects empty discussionId', async () => {
    await expect(
      createEventLogger({ discussionId: '', baseDir: testDir })
    ).rejects.toThrow('must not be empty');
  });

  it('rejects discussionId with path traversal', async () => {
    await expect(
      createEventLogger({ discussionId: '../etc/passwd', baseDir: testDir })
    ).rejects.toThrow('path traversal');
  });

  it('accepts all 12 valid event types', async () => {
    const logger = await createEventLogger({
      discussionId: 'all-types',
      baseDir: testDir,
    });

    const types = [
      'progress', 'chunk', 'model_done', 'model_error',
      'round_done', 'round_summary', 'anonymize', 'summary', 'done',
      'restore', 'error', 'interrupt_ack',
    ];

    for (const type of types) {
      await expect(
        logger.log({ type, data: {} })
      ).resolves.toBeUndefined();
    }

    const content = await readFile(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(12);
  });

  it('auto-creates parent directories', async () => {
    const deepDir = join(testDir, 'deep', 'nested', 'dir');
    const logger = await createEventLogger({
      discussionId: 'deep-test',
      baseDir: deepDir,
    });

    await logger.log({ type: 'done', data: {} });

    const content = await readFile(logger.getFilePath(), 'utf-8');
    expect(content.trim()).not.toBe('');
  });
});

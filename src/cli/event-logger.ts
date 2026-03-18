import { mkdir, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import type { SSEEventType } from '@/lib/types';

/** 当前 CLI / SSE 协议允许写入 JSONL 的事件类型 */
const VALID_EVENT_TYPES: Set<string> = new Set<SSEEventType>([
  'progress',
  'chunk',
  'model_done',
  'model_error',
  'round_done',
  'round_summary',
  'anonymize',
  'summary',
  'done',
  'restore',
  'error',
  'interrupt_ack',
]);

export interface LoggedEvent {
  timestamp: string;
  type: string;
  data: unknown;
}

export interface EventLogger {
  log(event: { type: string; data: unknown }): Promise<void>;
  getFilePath(): string;
}

/**
 * 校验 discussionId：非空、无路径穿越字符
 */
function validateDiscussionId(id: string): void {
  if (!id || id.trim() === '') {
    throw new Error('discussionId must not be empty');
  }
  if (/[/\\.]/.test(id)) {
    throw new Error(`Invalid discussionId: "${id}" contains path traversal characters`);
  }
}

/**
 * 校验事件类型：必须在当前协议白名单之内
 */
function validateEventType(type: string): void {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(`Invalid event type: "${type}". Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`);
  }
}

/**
 * 创建 EventLogger 实例
 *
 * - 按 JSONL 逐行追加写入
 * - 自动创建父目录
 * - 文件路径：{baseDir}/{discussionId}.events.jsonl
 */
export async function createEventLogger(params: {
  discussionId: string;
  baseDir?: string;
}): Promise<EventLogger> {
  const { discussionId, baseDir = '.agora/sessions' } = params;

  validateDiscussionId(discussionId);

  const filePath = join(baseDir, `${discussionId}.events.jsonl`);

  // 自动创建父目录
  await mkdir(dirname(filePath), { recursive: true });

  return {
    async log(event: { type: string; data: unknown }): Promise<void> {
      validateEventType(event.type);

      const loggedEvent: LoggedEvent = {
        timestamp: new Date().toISOString(),
        type: event.type,
        data: event.data,
      };

      const line = JSON.stringify(loggedEvent) + '\n';
      await appendFile(filePath, line, 'utf-8');
    },

    getFilePath(): string {
      return filePath;
    },
  };
}

/**
 * 轮询工具函数 — E06 polling fallback 核心逻辑
 *
 * 与 use-discussion-sse.ts 共享，可独立测试。
 */

import type { SSEEvent, DiscussionSummaryFinal } from '@/lib/types';

export const POLLING_INTERVAL_MS = 3000;
export const POLLING_MAX_MS = 180_000;

export interface PollDiscussionResponse {
  discussion: {
    status: string;
    summary: DiscussionSummaryFinal | null;
    total_platform_price: number;
    total_raw_cost: number;
  };
}

/**
 * 处理一次轮询结果 — 决定下一步操作。
 *
 * Returns:
 *   - `'continue'` — 讨论仍在进行，继续轮询
 *   - `'done'` — 讨论已终态，已发射 done/summary 事件，停止轮询
 *   - `'timeout'` — 超时，已发射 error 事件，停止轮询
 */
export function handlePollResult(
  data: PollDiscussionResponse,
  onEvent: (event: SSEEvent) => void
): 'continue' | 'done' {
  const { status, summary, total_platform_price, total_raw_cost } = data.discussion;

  if (status === 'completed' || status === 'failed' || status === 'aborted') {
    if (summary) {
      onEvent({ type: 'summary', data: { ...summary, seq: 0 } });
    }
    onEvent({
      type: 'done',
      data: {
        total_raw_cost: total_raw_cost ?? 0,
        total_platform_price: total_platform_price ?? 0,
        seq: 0,
      },
    });
    return 'done';
  }

  return 'continue';
}

/**
 * 检查是否超过最大轮询时间。
 */
export function isPollingTimeout(startTime: number, maxMs: number = POLLING_MAX_MS): boolean {
  return Date.now() - startTime > maxMs;
}

'use client';

import { useEffect, useRef, useCallback } from 'react';

import type { SSEEvent, DiscussionSummaryFinal } from '@/lib/types';

const POLLING_INTERVAL_MS = 3000;
const POLLING_MAX_MS = 180_000;

interface UseDiscussionSSEOptions {
  discussionId: string | null;
  onEvent: (event: SSEEvent) => void;
  onRestoreComplete?: () => void;
  enabled?: boolean;
}

export function useDiscussionSSE({ discussionId, onEvent, onRestoreComplete, enabled = true }: UseDiscussionSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);
  const canStreamRef = useRef<boolean>(true);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback((id: string) => {
    pollingStartRef.current = Date.now();
    stopPolling();

    pollingTimerRef.current = setInterval(async () => {
      if (Date.now() - pollingStartRef.current > POLLING_MAX_MS) {
        stopPolling();
        onEvent({ type: 'error', data: { code: 'POLLING_TIMEOUT', message: '讨论仍在进行中，请稍后刷新' } });
        return;
      }

      try {
        const res = await fetch(`/api/discussions/${id}`);
        if (!res.ok) return;
        const data = await res.json() as { discussion: { status: string; summary: DiscussionSummaryFinal | null; total_platform_price: number; total_raw_cost: number } };
        const { status, summary } = data.discussion;

        if (status === 'completed' || status === 'failed' || status === 'aborted') {
          stopPolling();
          if (summary) {
            onEvent({ type: 'summary', data: { ...summary, seq: 0 } });
          }
          onEvent({
            type: 'done',
            data: {
              total_raw_cost: data.discussion.total_raw_cost ?? 0,
              total_platform_price: data.discussion.total_platform_price ?? 0,
              seq: 0,
            },
          });
        }
      } catch {
        // ignore
      }
    }, POLLING_INTERVAL_MS);
  }, [onEvent, stopPolling]);

  useEffect(() => {
    if (!discussionId || !enabled) return;

    const es = new EventSource(`/api/discussions/${discussionId}/stream`);
    eventSourceRef.current = es;

    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as unknown;
        const event = { type, data } as SSEEvent;
        onEvent(event);

        if (type === 'restore') {
          const restoreData = data as { can_stream: boolean };
          canStreamRef.current = restoreData.can_stream;
          if (!restoreData.can_stream) {
            es.close();
            startPolling(discussionId);
          }
          onRestoreComplete?.();
        }

        if (type === 'done' || type === 'error') {
          es.close();
          stopPolling();
        }
      } catch {
        // ignore parse errors
      }
    };

    const sseTypes = ['progress', 'chunk', 'model_done', 'model_error', 'round_done', 'anonymize', 'summary', 'done', 'restore', 'error', 'interrupt_ack'];
    const listeners: Array<[string, (e: MessageEvent) => void]> = [];

    for (const type of sseTypes) {
      const listener = handleEvent(type);
      es.addEventListener(type, listener);
      listeners.push([type, listener]);
    }

    es.onerror = () => {
      es.close();
    };

    return () => {
      for (const [type, listener] of listeners) {
        es.removeEventListener(type, listener);
      }
      es.close();
      stopPolling();
    };
  }, [discussionId, enabled, onEvent, onRestoreComplete, startPolling, stopPolling]);
}

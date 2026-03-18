/**
 * I05 — SSE 断线恢复集成测试
 *
 * 验收标准：
 * 1. 建连时能根据 discussion 状态返回正确的 `restore` 事件
 * 2. `can_stream=true` 时能继续监听后续流（owner 角色）
 * 3. `can_stream=false` 时关闭连接（终态 / observer 角色）
 * 4. 已完成轮次的消息在 restore 事件中正确携带
 */

import { describe, expect, it } from 'vitest';

import { toRestoreEventData } from '@/lib/types';
import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import type { Conversation, Message } from '@/lib/types';
import type { SSEEvent } from '@/lib/types';

// ─── 辅助工厂 ──────────────────────────────────────────────────────────────────

function makeDiscussion(
  overrides: Partial<Conversation> = {}
): Conversation {
  return {
    id: 'disc-i05',
    user_id: 'u1',
    type: 'council',
    mode: 'consensus',
    status: 'completed',
    current_round: 3,
    last_completed_round: 3,
    models: ['m1', 'm2', 'm3'],
    title: 'I05 Test Discussion',
    topic: 'Should AI replace engineers?',
    billing_snapshot_id: 'snap-1',
    summary: null,
    visibility: 'private',
    share_slug: null,
    total_platform_price: 0,
    user_rating: null,
    created_at: '2026-03-19T00:00:00.000Z',
    updated_at: '2026-03-19T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(round: number, label: string): Message {
  return {
    id: `msg-${round}-${label}`,
    conversation_id: 'disc-i05',
    role: 'assistant',
    logical_model_id: label,
    actual_model_id: label,
    round,
    anonymous_label: `Model-${label}`,
    content: `Round ${round} content by ${label}`,
    status: 'completed',
    error_type: null,
    error_message: null,
    finish_reason: 'stop',
    created_at: '2026-03-19T00:00:00.000Z',
  };
}

// ─── toRestoreEventData ────────────────────────────────────────────────────────

describe('I05 — toRestoreEventData', () => {
  it('sets can_stream=false for completed discussion', () => {
    const event = toRestoreEventData({
      status: 'completed',
      currentRound: 3,
      lastCompletedRound: 3,
      canStream: false,
    });

    expect(event.resume_mode).toBe('state_restore');
    expect(event.can_stream).toBe(false);
    expect(event.current_status).toBe('completed');
    expect(event.current_round).toBe(3);
    expect(event.last_completed_round).toBe(3);
  });

  it('sets can_stream=true for in-progress discussion with stream lock', () => {
    const event = toRestoreEventData({
      status: 'streaming',
      currentRound: 2,
      lastCompletedRound: 1,
      canStream: true,
    });

    expect(event.can_stream).toBe(true);
    expect(event.current_status).toBe('streaming');
    expect(event.last_completed_round).toBe(1);
  });

  it('includes completed_round_messages in the restore payload', () => {
    const messages = [
      makeMessage(1, 'gpt'),
      makeMessage(1, 'claude'),
      makeMessage(2, 'gpt'),
      makeMessage(2, 'claude'),
    ];

    const event = toRestoreEventData({
      status: 'completed',
      currentRound: 3,
      lastCompletedRound: 2,
      canStream: false,
      completedRoundMessages: messages,
    });

    expect(event.completed_round_messages).toHaveLength(4);
    expect(event.completed_round_messages[0].round).toBe(1);
    expect(event.completed_round_messages[2].round).toBe(2);
  });

  it('includes summary in restore payload when provided', () => {
    const summary = {
      consensus: [{ content: 'AI will augment engineers, not replace them', supporting_models: ['m1', 'm2'], evidence_refs: [] }],
      disagreements: [],
      recommendation: 'Embrace AI as augmentation',
      confidence: 'high' as const,
      open_questions: [],
      evidence_refs: [],
      disclaimer: '',
      is_degraded: false,
    };

    const event = toRestoreEventData({
      status: 'completed',
      currentRound: 3,
      lastCompletedRound: 3,
      canStream: false,
      summary,
    });

    expect(event.summary).toEqual(summary);
  });

  it('includes error_code and error_message for failed discussion', () => {
    const event = toRestoreEventData({
      status: 'failed',
      currentRound: 1,
      lastCompletedRound: 0,
      canStream: false,
      errorCode: 'ALL_MODELS_FAILED',
      errorMessage: '所有模型均请求失败',
    });

    expect(event.current_status).toBe('failed');
    expect(event.can_stream).toBe(false);
    expect(event.error_code).toBe('ALL_MODELS_FAILED');
    expect(event.error_message).toBe('所有模型均请求失败');
  });

  it('defaults completed_round_messages to empty array when not provided', () => {
    const event = toRestoreEventData({
      status: 'aborted',
      currentRound: 0,
      lastCompletedRound: 0,
      canStream: false,
    });

    expect(event.completed_round_messages).toEqual([]);
    expect(event.summary).toBeNull();
  });
});

// ─── session-starter observer path（can_stream=false 分流） ────────────────────

describe('I05 — observer role returns can_stream=false context', () => {
  it('returns observer role when lock is already held (can_stream=false path)', async () => {
    const events: SSEEvent[] = [];

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u2', source: 'web' },
      discussionId: 'disc-i05',
      onEvent: (e) => events.push(e),
      repository: {
        async getDiscussion() {
          return makeDiscussion({ status: 'created' });
        },
      },
      lockStore: {
        // Simulates another session already holds the lock
        async acquireLock() { return false; },
        async releaseLock() { return true; },
      },
      runner: async () => undefined,
    });

    // Observer role = SSE route must send restore(can_stream=false) and close
    expect(result.role).toBe('observer');
    expect(result.execution).toBeNull();
    // No events emitted yet — the route layer constructs the restore response
    expect(events).toHaveLength(0);
  });

  it('returns owner role when lock is acquired (can_stream=true path)', async () => {
    const events: SSEEvent[] = [];
    const runner = async () => undefined;

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u1', source: 'web' },
      discussionId: 'disc-i05',
      onEvent: (e) => events.push(e),
      repository: {
        async getDiscussion() {
          return makeDiscussion({ status: 'created' });
        },
      },
      lockStore: {
        async acquireLock() { return true; },
        async releaseLock() { return true; },
      },
      runner,
    });

    // Owner role = can_stream=true, stream is active
    expect(result.role).toBe('owner');
    expect(result.execution).toBeInstanceOf(Promise);
  });

  it('returns observer role for already-streaming discussions without re-lock attempt', async () => {
    const acquireLockCalls: string[] = [];

    const result = await startOrAttachDiscussion({
      actor: { userId: 'u3', source: 'web' },
      discussionId: 'disc-i05',
      onEvent: () => undefined,
      repository: {
        async getDiscussion() {
          return makeDiscussion({ status: 'streaming' });
        },
      },
      lockStore: {
        async acquireLock(id) {
          acquireLockCalls.push(id);
          return false;
        },
        async releaseLock() { return true; },
      },
      runner: async () => undefined,
    });

    // streaming status → observer immediately, no lock attempt
    expect(result.role).toBe('observer');
    expect(acquireLockCalls).toHaveLength(0);
  });
});

// ─── SSE wire format ──────────────────────────────────────────────────────────

describe('I05 — SSE wire format', () => {
  it('restore payload satisfies the SSERestoreEvent schema structure', () => {
    const messages = [makeMessage(1, 'gpt'), makeMessage(1, 'claude')];
    const payload = toRestoreEventData({
      status: 'completed',
      currentRound: 3,
      lastCompletedRound: 3,
      canStream: false,
      completedRoundMessages: messages,
      summary: {
        consensus: [{ content: 'Test consensus', supporting_models: ['m1'], evidence_refs: [] }],
        disagreements: [],
        recommendation: 'Proceed with caution',
        confidence: 'medium' as const,
        open_questions: ['What about ethics?'],
        evidence_refs: [],
        disclaimer: '',
        is_degraded: false,
      },
    });

    // Verify all required fields are present and correctly typed
    expect(typeof payload.resume_mode).toBe('string');
    expect(typeof payload.can_stream).toBe('boolean');
    expect(typeof payload.current_status).toBe('string');
    expect(typeof payload.current_round).toBe('number');
    expect(typeof payload.last_completed_round).toBe('number');
    expect(Array.isArray(payload.completed_round_messages)).toBe(true);

    // Wire serialization round-trip check
    const serialized = JSON.stringify({ type: 'restore', data: payload });
    const parsed = JSON.parse(serialized) as { type: string; data: typeof payload };
    expect(parsed.type).toBe('restore');
    expect(parsed.data.can_stream).toBe(false);
    expect(parsed.data.completed_round_messages).toHaveLength(2);
  });

  it('restore event for in-progress discussion has can_stream=true when active', () => {
    const payload = toRestoreEventData({
      status: 'streaming',
      currentRound: 2,
      lastCompletedRound: 1,
      canStream: true,
    });

    const line = `event: restore\ndata: ${JSON.stringify(payload)}\n\n`;
    expect(line).toContain('"can_stream":true');
    expect(line).toContain('"resume_mode":"state_restore"');
  });
});

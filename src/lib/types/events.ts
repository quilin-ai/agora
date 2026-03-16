/**
 * SSE 事件类型（CORE_SPEC §8）
 *
 * CLI / Web / Test 共用同一事件协议。
 * 不得新增 CLI 专属事件，不得更改字段名。
 * replay / 测试 / Web SSE 必须消费同一 schema。
 *
 * 注意：CORE_SPEC §8 只冻结了 11 种事件类型名称。
 * 各事件的 data payload 结构均为基于 CLI 渲染建议推导的最小合理字段集，
 * 非正式冻结协议，后续可能随 v3.1 完整定义调整。
 */

import type { BillingCost } from './billing';
import type { DiscussionStatus } from './discussion';
import type { DiscussionSummaryFinal } from './secretary';

/** 允许的事件类型 — 11 种，不得新增 */
export type SSEEventType =
  | 'progress'
  | 'chunk'
  | 'model_done'
  | 'model_error'
  | 'round_done'
  | 'anonymize'
  | 'summary'
  | 'done'
  | 'restore'
  | 'error'
  | 'interrupt_ack';

// --- 每种事件的具体类型定义 ---

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议

/** progress — 阶段进度通知 */
export interface ProgressEvent {
  type: 'progress';
  data: {
    discussion_id: string;
    round: number;
    phase: string;
  };
}

/** chunk — 模型流式输出片段 */
export interface ChunkEvent {
  type: 'chunk';
  data: {
    discussion_id: string;
    model_id: string;
    text: string;
  };
}

/** model_done — 单个模型完成输出 */
export interface ModelDoneEvent {
  type: 'model_done';
  data: {
    discussion_id: string;
    model_id: string;
    tokens: number;
  };
}

/** model_error — 单个模型出错 */
export interface ModelErrorEvent {
  type: 'model_error';
  data: {
    discussion_id: string;
    model_id: string;
    error_message: string;
  };
}

/** round_done — 一轮讨论完成 */
export interface RoundDoneEvent {
  type: 'round_done';
  data: {
    discussion_id: string;
    round: number;
  };
}

/** anonymize — 匿名互评开始 */
export interface AnonymizeEvent {
  type: 'anonymize';
  data: {
    discussion_id: string;
    labels: string[];
  };
}

/** summary — Secretary 总结产出 */
export interface SummaryEvent {
  type: 'summary';
  data: {
    discussion_id: string;
    summary: DiscussionSummaryFinal;
  };
}

/** done — 讨论完成 */
export interface DoneEvent {
  type: 'done';
  data: {
    discussion_id: string;
    billing: BillingCost;
  };
}

/** restore — 恢复已有讨论状态 */
export interface RestoreEvent {
  type: 'restore';
  data: {
    discussion_id: string;
    status: DiscussionStatus;
    last_completed_round: number;
  };
}

/** error — 讨论级别致命错误 */
export interface ErrorEvent {
  type: 'error';
  data: {
    discussion_id: string;
    error_message: string;
  };
}

/** interrupt_ack — 用户插话确认 */
export interface InterruptAckEvent {
  type: 'interrupt_ack';
  data: {
    discussion_id: string;
  };
}

// --- Discriminated Union ---

/** SSE 事件 discriminated union — 以 type 字段区分 */
export type SSEEvent =
  | ProgressEvent
  | ChunkEvent
  | ModelDoneEvent
  | ModelErrorEvent
  | RoundDoneEvent
  | AnonymizeEvent
  | SummaryEvent
  | DoneEvent
  | RestoreEvent
  | ErrorEvent
  | InterruptAckEvent;

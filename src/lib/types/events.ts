import type { BillingCost } from './billing';
import type { ConversationStatus, DiscussionStatus, Message } from './discussion';
import type { DiscussionSummaryFinal, ModelFailureRecord } from './secretary';

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

export interface SSEProgressEvent {
  round: number;
  total_rounds: number;
  phase: string;
  seq: number;
}

export interface SSEChunkEvent {
  logical_model_id: string;
  actual_model_id: string;
  round: number;
  content: string;
  done: boolean;
  seq: number;
}

export interface SSEModelDoneEvent {
  logical_model_id: string;
  actual_model_id: string;
  round: number;
  tokens: {
    input: number;
    output: number;
  };
  seq: number;
}

export interface SSEModelErrorEvent {
  logical_model_id: string;
  actual_model_id: string | null;
  round: number;
  error_type: string;
  action: 'skipped' | 'retrying' | 'degraded';
  degraded_to: string | null;
  message: string;
  seq: number;
}

export interface SSERoundDoneEvent {
  round: number;
  completed_models: string[];
  skipped_models: string[];
  failed_models: ModelFailureRecord[];
  total_models: number;
  seq: number;
}

export interface SSEAnonymizeEvent {
  round: number;
  labels: string[];
  seq: number;
}

export interface SSESummaryEvent extends DiscussionSummaryFinal {
  seq: number;
}

export interface SSEDoneEvent {
  total_raw_cost: number;
  total_platform_price: number;
  seq: number;
}

export interface SSERestoreEvent {
  resume_mode: 'state_restore';
  can_stream: boolean;
  current_status: ConversationStatus;
  current_round: number;
  last_completed_round: number;
  completed_round_messages: Message[];
  summary: DiscussionSummaryFinal | null;
  error_code?: string;
  error_message?: string;
}

export interface SSEInterruptAckEvent {
  status: 'acknowledged';
  message: string;
  seq: number;
}

export interface SSEErrorEvent {
  code: string;
  message: string;
}

export type ProgressEvent = { type: 'progress'; data: SSEProgressEvent };
export type ChunkEvent = { type: 'chunk'; data: SSEChunkEvent };
export type ModelDoneEvent = { type: 'model_done'; data: SSEModelDoneEvent };
export type ModelErrorEvent = { type: 'model_error'; data: SSEModelErrorEvent };
export type RoundDoneEvent = { type: 'round_done'; data: SSERoundDoneEvent };
export type AnonymizeEvent = { type: 'anonymize'; data: SSEAnonymizeEvent };
export type SummaryEvent = { type: 'summary'; data: SSESummaryEvent };
export type DoneEvent = { type: 'done'; data: SSEDoneEvent };
export type RestoreEvent = { type: 'restore'; data: SSERestoreEvent };
export type ErrorEvent = { type: 'error'; data: SSEErrorEvent };
export type InterruptAckEvent = { type: 'interrupt_ack'; data: SSEInterruptAckEvent };

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

export function toDoneEventData(billing: BillingCost, seq: number): SSEDoneEvent {
  return {
    total_raw_cost: billing.raw_cost,
    total_platform_price: billing.platform_price,
    seq,
  };
}

export function toRestoreEventData(params: {
  status: DiscussionStatus;
  currentRound: number;
  lastCompletedRound: number;
  canStream?: boolean;
  completedRoundMessages?: Message[];
  summary?: DiscussionSummaryFinal | null;
  errorCode?: string;
  errorMessage?: string;
}): SSERestoreEvent {
  return {
    resume_mode: 'state_restore',
    can_stream: params.canStream ?? false,
    current_status: params.status,
    current_round: params.currentRound,
    last_completed_round: params.lastCompletedRound,
    completed_round_messages: params.completedRoundMessages ?? [],
    summary: params.summary ?? null,
    error_code: params.errorCode,
    error_message: params.errorMessage,
  };
}

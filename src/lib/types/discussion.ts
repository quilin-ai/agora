import type { DiscussionSummaryFinal } from './secretary';

export type DiscussionStatus =
  | 'created'
  | 'streaming'
  | 'summarizing'
  | 'completed'
  | 'failed'
  | 'aborted';

export type ConversationStatus = DiscussionStatus;

export type TerminalStatus = 'completed' | 'failed' | 'aborted';

export type ConversationType = 'chat' | 'council';
export type DiscussionMode = 'consensus';
export type ConversationMode = DiscussionMode;
export type Visibility = 'private' | 'public' | 'team';
export type ConversationVisibility = Visibility;
export type RiskLevel = 'normal' | 'sensitive' | 'high_risk';
export type MessageRole = 'user' | 'assistant' | 'secretary' | 'system';
export type MessageStatus = 'streaming' | 'completed' | 'partial' | 'error' | 'skipped' | 'timeout';
export type FinishReason = 'stop' | 'length' | 'timeout' | 'error' | 'filtered' | 'unknown';
export type ModelErrorType =
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'stream_interrupted'
  | 'output_filtered';

export type RoundType = 'independent' | 'review' | 'rebuttal';
export type RoundNumber = 1 | 2 | 3;
export type RoundStatus = 'completed' | 'partial' | 'failed';
export type ExecutionStatus = 'started' | 'completed' | 'failed' | 'timeout';

export type DiscussionTransition =
  | { from: 'created'; to: 'streaming' }
  | { from: 'created'; to: 'aborted' }
  | { from: 'created'; to: 'failed' }
  | { from: 'streaming'; to: 'streaming' }
  | { from: 'streaming'; to: 'summarizing' }
  | { from: 'streaming'; to: 'failed' }
  | { from: 'streaming'; to: 'aborted' }
  | { from: 'summarizing'; to: 'completed' }
  | { from: 'summarizing'; to: 'failed' };

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  logical_model_id?: string | null;
  actual_model_id?: string | null;
  round?: number | null;
  anonymous_label?: string | null;
  content: string;
  status?: MessageStatus | null;
  error_type?: ModelErrorType | null;
  error_message?: string | null;
  finish_reason?: FinishReason | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  type: ConversationType;
  mode: DiscussionMode;
  status: ConversationStatus;
  current_round: number;
  last_completed_round: number;
  models: string[];
  max_rounds?: number;
  title: string | null;
  topic: string | null;
  billing_snapshot_id?: string | null;
  summary: DiscussionSummaryFinal | null;
  visibility: Visibility;
  share_slug: string | null;
  risk_level?: RiskLevel;
  total_platform_price: number;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

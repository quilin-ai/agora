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
export type ConversationMode = 'consensus';
export type ConversationVisibility = 'private' | 'public';
export type MessageRole = 'user' | 'assistant' | 'system';

export type RoundType = 'independent' | 'review' | 'rebuttal';
export type RoundNumber = 1 | 2 | 3;
export type RoundStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExecutionStatus = 'running' | 'completed' | 'failed';

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
  status?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  type: ConversationType;
  mode: string;
  status: ConversationStatus;
  current_round: number;
  last_completed_round: number;
  models: string[];
  title: string | null;
  topic: string | null;
  summary: DiscussionSummaryFinal | null;
  visibility: string;
  share_slug: string | null;
  total_platform_price: number;
  user_rating: number | null;
  created_at: string;
  updated_at: string;
}

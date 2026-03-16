import type { Conversation, Message } from './discussion';
import type { DiscussionSummaryFinal } from './secretary';

export interface CreateDiscussionRequest {
  topic: string;
  models?: string[];
  mode?: 'consensus';
  max_rounds?: 3;
  idempotency_key: string;
}

export interface CreateDiscussionResponse {
  id: string;
  status: 'created';
  estimated_raw_cost: number;
  held_platform_amount: number;
  stream_url: string;
}

export interface InterruptRequest {
  content: string;
  target: 'broadcast' | 'targeted';
  target_model_id?: string;
}

export interface FollowupRequest {
  mode: 'ask_secretary' | 'ask_model' | 'new_council';
  content: string;
  model_id?: string;
}

export interface ShareResponse {
  share_url: string;
  slug: string;
}

export interface RateRequest {
  rating: 1 | -1;
  tags?: string[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  plan: string;
  credits_balance: number;
  credits_monthly: number;
  free_frontier_remaining: number;
  free_budget_remaining: number;
  locale: string;
  default_model: string;
  twitter_handle: string;
  referral_code: string;
  created_at: string;
}

export interface UpdatePreferencesRequest {
  default_model?: string;
  locale?: 'en' | 'zh';
  name?: string;
}

export interface ConversationListItem {
  id: string;
  type: string;
  mode: string;
  title: string;
  status: string;
  models: string[];
  visibility: string;
  total_platform_price: number;
  user_rating: number;
  created_at: string;
  updated_at: string;
}

export interface DiscussionDetail {
  discussion: Conversation;
  messages: Message[];
}

export interface ExploreItem {
  id: string;
  title: string;
  topic: string;
  mode: string;
  models: string[];
  summary: DiscussionSummaryFinal;
  share_slug: string;
  user_rating: number;
  created_at: string;
  user_name: string;
  user_avatar: string;
  twitter_handle: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

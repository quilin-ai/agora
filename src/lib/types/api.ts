/**
 * API 请求 / 响应类型（CORE_SPEC §12）
 */

import type { DiscussionStatus } from './discussion';

export interface CreateDiscussionRequest {
  topic: string;
  model_ids: string[];
  conversation_id?: string;
}

export interface CreateDiscussionResponse {
  discussion_id: string;
  conversation_id: string;
  status: DiscussionStatus;
}

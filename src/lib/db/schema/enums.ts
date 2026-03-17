export const discussionStatuses = [
  'created',
  'streaming',
  'summarizing',
  'completed',
  'failed',
  'aborted',
] as const;

export const conversationTypes = ['chat', 'council'] as const;
export const visibilities = ['private', 'public', 'team'] as const;
export const riskLevels = ['normal', 'sensitive', 'high_risk'] as const;

export const messageRoles = ['user', 'assistant', 'secretary', 'system'] as const;
export const messageStatuses = [
  'streaming',
  'completed',
  'partial',
  'error',
  'skipped',
  'timeout',
] as const;
export const finishReasons = ['stop', 'length', 'timeout', 'error', 'filtered', 'unknown'] as const;
export const modelErrorTypes = [
  'timeout',
  'rate_limited',
  'server_error',
  'stream_interrupted',
  'output_filtered',
] as const;

export const roundTypes = ['independent', 'review', 'rebuttal'] as const;
export const roundStatuses = ['completed', 'partial', 'failed'] as const;
export const executionStatuses = ['started', 'completed', 'failed', 'timeout'] as const;
export const creditTransactionTypes = [
  'hold',
  'settle',
  'release',
  'refund',
  'grant',
  'purchase',
  'monthly_reset',
] as const;

export type DiscussionStatusValue = (typeof discussionStatuses)[number];
export type ConversationTypeValue = (typeof conversationTypes)[number];
export type VisibilityValue = (typeof visibilities)[number];
export type RiskLevelValue = (typeof riskLevels)[number];
export type MessageRoleValue = (typeof messageRoles)[number];
export type MessageStatusValue = (typeof messageStatuses)[number];
export type FinishReasonValue = (typeof finishReasons)[number];
export type ModelErrorTypeValue = (typeof modelErrorTypes)[number];
export type RoundTypeValue = (typeof roundTypes)[number];
export type RoundStatusValue = (typeof roundStatuses)[number];
export type ExecutionStatusValue = (typeof executionStatuses)[number];
export type CreditTransactionTypeValue = (typeof creditTransactionTypes)[number];

export const discussionStatuses = [
  'created',
  'streaming',
  'summarizing',
  'completed',
  'failed',
  'aborted',
] as const;

export const conversationTypes = ['chat', 'council'] as const;

export const messageRoles = ['user', 'assistant', 'system'] as const;

export const roundTypes = ['independent', 'review', 'rebuttal'] as const;

export const roundStatuses = ['pending', 'running', 'completed', 'failed'] as const;

export const executionStatuses = ['running', 'completed', 'failed'] as const;

export const creditTransactionTypes = ['hold', 'release', 'refund', 'settle'] as const;

export type DiscussionStatusValue = (typeof discussionStatuses)[number];
export type ConversationTypeValue = (typeof conversationTypes)[number];
export type MessageRoleValue = (typeof messageRoles)[number];
export type RoundTypeValue = (typeof roundTypes)[number];
export type RoundStatusValue = (typeof roundStatuses)[number];
export type ExecutionStatusValue = (typeof executionStatuses)[number];
export type CreditTransactionTypeValue = (typeof creditTransactionTypes)[number];

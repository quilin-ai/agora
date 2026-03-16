import { pgEnum } from 'drizzle-orm/pg-core';

export const discussionStatusEnum = pgEnum('discussion_status', [
  'created',
  'streaming',
  'summarizing',
  'completed',
  'failed',
  'aborted',
]);

export const roundTypeEnum = pgEnum('round_type', [
  'independent',
  'review',
  'rebuttal',
]);

export const roundStatusEnum = pgEnum('round_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const executionStatusEnum = pgEnum('execution_status', [
  'running',
  'completed',
  'failed',
]);

export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'hold',
  'release',
  'refund',
  'settle',
]);

export const conversationTypeEnum = pgEnum('conversation_type', [
  'chat',
  'council',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user',
  'assistant',
  'system',
]);

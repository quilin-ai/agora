import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  billingSnapshots,
  byokKeys,
  conversations,
  conversationTypes,
  creditTransactionTypes,
  creditTransactions,
  discussionAnonymizationMaps,
  discussionExecutions,
  discussionRounds,
  discussionStatuses,
  events,
  executionStatuses,
  messageRoles,
  messages,
  promptTemplates,
  roundStatuses,
  roundTypes,
  users,
} from '@/lib/db/schema';

describe('db schema exports', () => {
  it('exports all Task-002 tables and enum value sets', () => {
    expect(billingSnapshots).toBeDefined();
    expect(users).toBeDefined();
    expect(conversations).toBeDefined();
    expect(messages).toBeDefined();
    expect(discussionRounds).toBeDefined();
    expect(discussionExecutions).toBeDefined();
    expect(discussionAnonymizationMaps).toBeDefined();
    expect(promptTemplates).toBeDefined();
    expect(creditTransactions).toBeDefined();
    expect(byokKeys).toBeDefined();
    expect(events).toBeDefined();

    expect(discussionStatuses).toEqual([
      'created',
      'streaming',
      'summarizing',
      'completed',
      'failed',
      'aborted',
    ]);
    expect(roundTypes).toEqual(['independent', 'review', 'rebuttal']);
    expect(roundStatuses).toEqual(['pending', 'running', 'completed', 'failed']);
    expect(executionStatuses).toEqual(['running', 'completed', 'failed']);
    expect(creditTransactionTypes).toEqual(['hold', 'release', 'refund', 'settle']);
    expect(conversationTypes).toEqual(['chat', 'council']);
    expect(messageRoles).toEqual(['user', 'assistant', 'system']);
  });

  it('exposes v3.2 frozen fields on conversations', () => {
    expect(conversations.status).toBeDefined();
    expect(conversations.currentRound).toBeDefined();
    expect(conversations.lastCompletedRound).toBeDefined();
    expect(conversations.summary).toBeDefined();
    expect(conversations.models).toBeDefined();
    expect(conversations.topicHash).toBeDefined();
    expect(conversations.parentId).toBeDefined();
    expect(conversations.billingSnapshotId).toBeDefined();
  });

  it('exposes v3.2 frozen fields on messages and rounds', () => {
    expect(messages.logicalModelId).toBeDefined();
    expect(messages.actualModelId).toBeDefined();
    expect(messages.promptVersionId).toBeDefined();
    expect(messages.isForkPoint).toBeDefined();

    expect(discussionRounds.conversationId).toBeDefined();
    expect(discussionRounds.round).toBeDefined();
    expect(discussionRounds.completedModels).toBeDefined();
    expect(discussionRounds.failedModels).toBeDefined();
    expect(discussionRounds.compressedState).toBeDefined();
    expect(discussionRounds.roundTraceId).toBeDefined();
  });

  it('exposes v3.2 frozen billing and security tables', () => {
    expect(creditTransactions.amount).toBeDefined();
    expect(creditTransactions.balanceAfter).toBeDefined();
    expect(creditTransactions.rawCostRef).toBeDefined();
    expect(creditTransactions.billingSnapshotId).toBeDefined();

    expect(byokKeys.encryptedKey).toBeDefined();
    expect(byokKeys.isValid).toBeDefined();
    expect(events.eventName).toBeDefined();
    expect(events.properties).toBeDefined();
  });

  it('registers the required key indexes and unique constraints', () => {
    const conversationIndexes = getTableConfig(conversations).indexes.map((index) => index.config.name);
    const promptIndexes = getTableConfig(promptTemplates).indexes.map((index) => index.config.name);
    const creditIndexes = getTableConfig(creditTransactions).indexes.map((index) => index.config.name);

    expect(conversationIndexes).toContain('uq_conv_idempotency');
    expect(conversationIndexes).toContain('idx_conv_user');
    expect(conversationIndexes).toContain('idx_conv_status');
    expect(conversationIndexes).toContain('idx_conv_visibility');
    expect(conversationIndexes).toContain('idx_conv_share');
    expect(conversationIndexes).toContain('idx_conv_user_topic_hash');

    expect(promptIndexes).toContain('idx_prompt_active');
    expect(creditIndexes).toContain('idx_credit_user');
    expect(creditIndexes).toContain('idx_credit_created');
  });
});

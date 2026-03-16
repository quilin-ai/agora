import { describe, expect, it } from 'vitest';

import {
  billingSnapshots,
  conversations,
  conversationTypeEnum,
  creditTransactionTypeEnum,
  creditTransactions,
  discussionAnonymizationMaps,
  discussionExecutions,
  discussionStatusEnum,
  discussionRounds,
  discussions,
  executionStatusEnum,
  messageRoleEnum,
  messages,
  modelConfigs,
  promptTemplates,
  roundStatusEnum,
  roundTypeEnum,
  users,
} from '@/lib/db/schema';

describe('db schema exports', () => {
  it('exports all Task-002 tables and enums', () => {
    expect(users).toBeDefined();
    expect(conversations).toBeDefined();
    expect(messages).toBeDefined();
    expect(discussions).toBeDefined();
    expect(discussionRounds).toBeDefined();
    expect(discussionExecutions).toBeDefined();
    expect(discussionAnonymizationMaps).toBeDefined();
    expect(modelConfigs).toBeDefined();
    expect(promptTemplates).toBeDefined();
    expect(creditTransactions).toBeDefined();
    expect(billingSnapshots).toBeDefined();
    expect(discussionStatusEnum).toBeDefined();
    expect(roundTypeEnum).toBeDefined();
    expect(roundStatusEnum).toBeDefined();
    expect(executionStatusEnum).toBeDefined();
    expect(creditTransactionTypeEnum).toBeDefined();
    expect(conversationTypeEnum).toBeDefined();
    expect(messageRoleEnum).toBeDefined();
  });

  it('exposes frozen key fields on discussions', () => {
    expect(discussions.status).toBeDefined();
    expect(discussions.currentRound).toBeDefined();
    expect(discussions.lastCompletedRound).toBeDefined();
    expect(discussions.summary).toBeDefined();
    expect(discussions.modelIds).toBeDefined();
    expect(discussions.conversationId).toBeDefined();
  });

  it('exposes frozen key fields on credit transactions', () => {
    expect(creditTransactions.amountRaw).toBeDefined();
    expect(creditTransactions.amountPlatform).toBeDefined();
    expect(creditTransactions.billingSnapshotId).toBeDefined();
    expect(creditTransactions.type).toBeDefined();
  });
});

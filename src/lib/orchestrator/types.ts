import type { BillingCost, DiscussionStatus, DiscussionSummaryFinal, SSEEvent } from '@/lib/types';
import type { ModelFailureRecord } from '@/lib/types';

export interface DiscussionRuntimeRecord {
  id: string;
  conversationId: string;
  topic: string;
  status: DiscussionStatus;
  currentRound: number;
  lastCompletedRound: number;
  modelIds: string[];
  summary: DiscussionSummaryFinal | null;
}

export interface RoundModelResponse {
  modelId: string;
  actualModelId: string;
  round: number;
  text: string;
  inputTokens: number;
  tokens: number;
}

export interface RoundPersistenceRecord {
  discussionId: string;
  roundNumber: number;
  status: 'completed' | 'partial' | 'failed';
  modelResponses: RoundModelResponse[];
  failedModels?: ModelFailureRecord[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface PromptTemplateRecord {
  id: string;
  version: string;
  model: string;
  mode: string;
  role: string;
  roundType: string;
  content: string;
  isActive: boolean;
}

export interface PromptTemplateLookup {
  modelId: string;
  mode: string;
  role: string;
  roundType: string;
}

export interface PromptTemplateStore {
  getActiveTemplate(lookup: PromptTemplateLookup): Promise<PromptTemplateRecord>;
}

export interface StreamChunk {
  text: string;
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CompletionResult {
  text: string;
  usage: CompletionUsage;
  finishReason: string | null;
}

export interface CompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: {
    type: 'json_object';
  };
}

export interface OpenRouterClient {
  streamCompletion(
    request: CompletionRequest
  ): AsyncGenerator<StreamChunk, CompletionResult, void>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface DiscussionStateUpdates {
  currentRound?: number;
  lastCompletedRound?: number;
  summary?: DiscussionSummaryFinal | null;
  completedAt?: Date;
  failedAt?: Date;
  abortedAt?: Date;
  executionStartedAt?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface DiscussionStateStore {
  updateStatus(params: {
    discussionId: string;
    from: DiscussionStatus;
    to: DiscussionStatus;
    updates?: DiscussionStateUpdates;
  }): Promise<boolean>;
}

export interface LockReleaseInput {
  status?: 'completed' | 'failed' | 'timeout';
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ExecutionLockStore {
  acquireLock(discussionId: string, lockHolder: string): Promise<boolean>;
  releaseLock(
    discussionId: string,
    lockHolder: string,
    input?: LockReleaseInput
  ): Promise<boolean>;
}

export interface AnonymizationMapping {
  discussionId: string;
  roundNumber: number;
  modelId: string;
  anonymousLabel: string;
}

export interface AnonymizationStore {
  saveMappings(mappings: AnonymizationMapping[]): Promise<void>;
}

export interface ConsensusRepository {
  getDiscussion(discussionId: string): Promise<DiscussionRuntimeRecord | null>;
  saveRound(record: RoundPersistenceRecord): Promise<void>;
  saveSummary(discussionId: string, summary: DiscussionSummaryFinal): Promise<void>;
}

export interface BillingResolver {
  resolveForDiscussion(discussionId: string): Promise<BillingCost>;
}

export interface StreamHub {
  emit(event: SSEEvent): void;
  progress(discussionId: string, round: number, phase: string): void;
  chunk(params: {
    discussionId: string;
    logicalModelId: string;
    actualModelId: string;
    round: number;
    text: string;
    done?: boolean;
  }): void;
  modelDone(params: {
    discussionId: string;
    logicalModelId: string;
    actualModelId: string;
    round: number;
    inputTokens: number;
    outputTokens: number;
  }): void;
  modelError(params: {
    discussionId: string;
    logicalModelId: string;
    actualModelId: string | null;
    round: number;
    errorType: string;
    action: 'skipped' | 'retrying' | 'degraded';
    degradedTo?: string | null;
    message: string;
  }): void;
  roundDone(params: {
    discussionId: string;
    round: number;
    completedModels: string[];
    skippedModels: string[];
    failedModels: ModelFailureRecord[];
    totalModels: number;
  }): void;
  anonymize(discussionId: string, round: number, labels: string[]): void;
  summary(discussionId: string, summary: DiscussionSummaryFinal): void;
  done(discussionId: string, billing: BillingCost): void;
  restore(
    discussionId: string,
    status: DiscussionStatus,
    currentRound: number,
    lastCompletedRound: number
  ): void;
  error(discussionId: string, errorMessage: string): void;
  interruptAck(discussionId: string): void;
}

export interface RoundExecutionResult {
  responses: RoundModelResponse[];
  failures: ModelFailureRecord[];
}

export interface ContextSection {
  title: string;
  content: string;
}

export class PromptTemplateMissingError extends Error {
  constructor(readonly lookup: PromptTemplateLookup) {
    super(
      `Missing active prompt template for model=${lookup.modelId} mode=${lookup.mode} role=${lookup.role} roundType=${lookup.roundType}`
    );
    this.name = 'PromptTemplateMissingError';
  }
}

export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly causeValue?: unknown
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

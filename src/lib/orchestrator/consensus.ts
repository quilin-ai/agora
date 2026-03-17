import { and, eq } from 'drizzle-orm';

import type {
  ActorContext,
  DiscussionSummaryFinal,
  RoundNumber,
  RoundType,
  SSEEvent,
} from '@/lib/types';
import { createOpenRouterClient } from '@/lib/openrouter/client';

import { anonymizeModels, anonymizeRoundResponses } from './anonymizer';
import { compressContext } from './context-manager';
import { acquireLock, releaseLock } from './execution-lock';
import {
  createDefaultPromptTemplateStore,
  renderPromptTemplate,
  runSecretarySummary,
} from './secretary';
import { casTransition } from './state-machine';
import { createStreamHub } from './stream-hub';
import type {
  BillingResolver,
  ConsensusRepository,
  DiscussionRuntimeRecord,
  ExecutionLockStore,
  OpenRouterClient,
  PromptTemplateStore,
  RoundExecutionResult,
  RoundModelResponse,
  StreamHub,
  DiscussionStateStore,
} from './types';
import { OrchestratorError } from './types';

const MIN_PARTICIPANT_MODELS = 2;

export async function runConsensusDiscussion(params: {
  discussionId: string;
  actor: ActorContext;
  onEvent: (event: SSEEvent) => void;
  repository?: ConsensusRepository;
  promptStore?: PromptTemplateStore;
  client?: OpenRouterClient;
  stateStore?: DiscussionStateStore;
  lockStore?: ExecutionLockStore;
  billingResolver?: BillingResolver;
  now?: () => Date;
  lockAlreadyAcquired?: boolean;
}): Promise<void> {
  const repository = params.repository ?? (await createDefaultConsensusRepository());
  const promptStore = params.promptStore ?? (await createDefaultPromptTemplateStore());
  const client = params.client ?? createOpenRouterClient();
  const hub = createStreamHub(params.onEvent);
  const lockHolder = `${params.actor.source}:${params.actor.userId}`;
  const billingResolver = params.billingResolver ?? createZeroBillingResolver();
  const now = params.now ?? (() => new Date());

  if (!params.lockAlreadyAcquired) {
    const lockAcquired = await acquireLock(params.discussionId, lockHolder, params.lockStore);
    if (!lockAcquired) {
      throw new OrchestratorError(
        `Discussion ${params.discussionId} is already running`,
        'EXECUTION_LOCK_CONFLICT'
      );
    }
  }

  try {
    const discussion = await loadDiscussionOrThrow(params.discussionId, repository);
    validateParticipants(discussion);

    const started = await casTransition({
      discussionId: discussion.id,
      from: 'created',
      to: 'streaming',
      updates: {
        currentRound: 1,
        executionStartedAt: now(),
      },
      store: params.stateStore,
    });

    if (!started) {
      throw new OrchestratorError(
        `Discussion ${discussion.id} could not transition from created to streaming`,
        'DISCUSSION_STATE_CONFLICT'
      );
    }

    hub.progress(discussion.id, 1, 'independent');

    const round1 = await executeRound({
      discussion,
      roundNumber: 1,
      roundType: 'independent',
      context: `Topic:\n${discussion.topic}`,
      promptMode: 'independent',
      promptStore,
      client,
      repository,
      hub,
      now,
    });

    await casTransition({
      discussionId: discussion.id,
      from: 'streaming',
      to: 'streaming',
      updates: {
        currentRound: 2,
        lastCompletedRound: 1,
      },
      store: params.stateStore,
    });
    hub.roundDone({
      discussionId: discussion.id,
      round: 1,
      completedModels: round1.responses.map((response) => response.modelId),
      skippedModels: round1.failures.map((failure) => failure.logical_model_id),
      failedModels: round1.failures,
      totalModels: discussion.modelIds.length,
    });

    const mappings = await anonymizeModels({
      discussionId: discussion.id,
      modelIds: discussion.modelIds,
    });
    hub.progress(discussion.id, 2, 'anonymous_review');
    hub.anonymize(
      discussion.id,
      2,
      mappings.map((mapping) => mapping.anonymousLabel)
    );

    const round2Context = anonymizeRoundResponses(round1.responses, mappings);
    const round2 = await executeRound({
      discussion,
      roundNumber: 2,
      roundType: 'review',
      context: round2Context,
      promptMode: 'review',
      promptStore,
      client,
      repository,
      hub,
      now,
    });

    await casTransition({
      discussionId: discussion.id,
      from: 'streaming',
      to: 'streaming',
      updates: {
        currentRound: 3,
        lastCompletedRound: 2,
      },
      store: params.stateStore,
    });
    hub.roundDone({
      discussionId: discussion.id,
      round: 2,
      completedModels: round2.responses.map((response) => response.modelId),
      skippedModels: round2.failures.map((failure) => failure.logical_model_id),
      failedModels: round2.failures,
      totalModels: discussion.modelIds.length,
    });

    hub.progress(discussion.id, 3, 'rebuttal');
    const compressedContext = compressContext([
      { title: 'Round 1', content: anonymizeRoundResponses(round1.responses, mappings) },
      { title: 'Round 2', content: round2.responses.map(formatResponse).join('\n\n') },
    ]);

    const round3 = await executeRound({
      discussion,
      roundNumber: 3,
      roundType: 'rebuttal',
      context: compressedContext.content,
      promptMode: 'rebuttal',
      promptStore,
      client,
      repository,
      hub,
      now,
    });

    await casTransition({
      discussionId: discussion.id,
      from: 'streaming',
      to: 'summarizing',
      updates: {
        currentRound: 3,
        lastCompletedRound: 3,
      },
      store: params.stateStore,
    });
    hub.roundDone({
      discussionId: discussion.id,
      round: 3,
      completedModels: round3.responses.map((response) => response.modelId),
      skippedModels: round3.failures.map((failure) => failure.logical_model_id),
      failedModels: round3.failures,
      totalModels: discussion.modelIds.length,
    });
    hub.progress(discussion.id, 3, 'secretary_summary');

    const secretarySummary = await runSecretarySummary({
      discussionId: discussion.id,
      secretaryModelId: discussion.modelIds[0],
      topic: discussion.topic,
      context: [round1, round2, round3]
        .flatMap((round) => round.responses)
        .map(formatResponse)
        .join('\n\n'),
      participantModelIds: discussion.modelIds,
      promptStore,
      client,
      now,
    });

    await repository.saveSummary(discussion.id, secretarySummary);
    hub.summary(discussion.id, secretarySummary);

    const completed = await casTransition({
      discussionId: discussion.id,
      from: 'summarizing',
      to: 'completed',
      updates: {
        currentRound: 3,
        lastCompletedRound: 4,
        summary: secretarySummary,
        completedAt: now(),
        errorCode: null,
        errorMessage: null,
      },
      store: params.stateStore,
    });

    if (!completed) {
      throw new OrchestratorError(
        `Discussion ${discussion.id} could not transition from summarizing to completed`,
        'DISCUSSION_STATE_CONFLICT'
      );
    }

    const billing = await billingResolver.resolveForDiscussion(discussion.id);
    hub.done(discussion.id, billing);

    await releaseLock(discussion.id, lockHolder, { status: 'completed' }, params.lockStore);
  } catch (error) {
    await handleFatalError({
      discussionId: params.discussionId,
      lockHolder,
      error,
      hub,
      stateStore: params.stateStore,
      lockStore: params.lockStore,
      now,
    });

    throw error;
  }
}

async function executeRound(params: {
  discussion: DiscussionRuntimeRecord;
  roundNumber: RoundNumber;
  roundType: RoundType;
  context: string;
  promptMode: 'independent' | 'review' | 'rebuttal';
  promptStore: PromptTemplateStore;
  client: OpenRouterClient;
  repository: ConsensusRepository;
  hub: StreamHub;
  now: () => Date;
}): Promise<RoundExecutionResult> {
  const startedAt = params.now();

  const settled = await Promise.allSettled(
    params.discussion.modelIds.map(async (modelId) => {
      const template = await params.promptStore.getActiveTemplate({
        modelId,
        mode: params.promptMode,
        role: 'participant',
        roundType: params.roundType,
      });
      const generator = params.client.streamCompletion({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: renderPromptTemplate(template.content, {
              topic: params.discussion.topic,
              context: params.context,
              discussion_id: params.discussion.id,
            }),
          },
        ],
      });

      let fullText = '';
      while (true) {
        const next = await generator.next();
        if (next.done) {
          const result = next.value;
          params.hub.modelDone({
            discussionId: params.discussion.id,
            logicalModelId: modelId,
            actualModelId: modelId,
            round: params.roundNumber,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
          });
          return {
            modelId,
            actualModelId: modelId,
            round: params.roundNumber,
            text: fullText,
            inputTokens: result.usage.promptTokens,
            tokens: result.usage.completionTokens,
          } satisfies RoundModelResponse;
        }

        if (next.value.text) {
          fullText += next.value.text;
          params.hub.chunk({
            discussionId: params.discussion.id,
            logicalModelId: modelId,
            actualModelId: modelId,
            round: params.roundNumber,
            text: next.value.text,
          });
        }
      }
    })
  );

  const responses: RoundModelResponse[] = [];
  const failures: RoundExecutionResult['failures'] = [];

  settled.forEach((result, index) => {
    const modelId = params.discussion.modelIds[index];

    if (result.status === 'fulfilled') {
      responses.push(result.value);
      return;
    }

    const errorMessage =
      result.reason instanceof Error ? result.reason.message : 'Unknown model execution error';

    const failure = {
      logical_model_id: modelId,
      actual_model_id: null,
      error_type: inferErrorType(errorMessage),
      action: 'skipped' as const,
    };

    params.hub.modelError({
      discussionId: params.discussion.id,
      logicalModelId: modelId,
      actualModelId: null,
      round: params.roundNumber,
      errorType: failure.error_type,
      action: failure.action,
      degradedTo: null,
      message: errorMessage,
    });
    failures.push(failure);
  });

  if (responses.length < MIN_PARTICIPANT_MODELS) {
    await params.repository.saveRound({
      discussionId: params.discussion.id,
      roundNumber: params.roundNumber,
      status: 'failed',
      modelResponses: responses,
      failedModels: failures,
      startedAt,
      completedAt: params.now(),
    });

    throw new OrchestratorError(
      `Round ${params.roundNumber} dropped below the minimum participant threshold`,
      'INSUFFICIENT_LIVE_MODELS',
      failures
    );
  }

  await params.repository.saveRound({
    discussionId: params.discussion.id,
    roundNumber: params.roundNumber,
    status: failures.length > 0 ? 'partial' : 'completed',
    modelResponses: responses,
    failedModels: failures,
    startedAt,
    completedAt: params.now(),
  });

  return { responses, failures };
}

async function handleFatalError(params: {
  discussionId: string;
  lockHolder: string;
  error: unknown;
  hub: StreamHub;
  stateStore?: DiscussionStateStore;
  lockStore?: ExecutionLockStore;
  now: () => Date;
}): Promise<void> {
  const code =
    params.error instanceof OrchestratorError ? params.error.code : 'ORCHESTRATOR_FATAL_ERROR';
  const message = params.error instanceof Error ? params.error.message : 'Unknown orchestrator error';

  try {
    await casTransition({
      discussionId: params.discussionId,
      from: 'streaming',
      to: 'failed',
      updates: {
        failedAt: params.now(),
        errorCode: code,
        errorMessage: message,
      },
      store: params.stateStore,
    });
  } catch {
    try {
      await casTransition({
        discussionId: params.discussionId,
        from: 'summarizing',
        to: 'failed',
        updates: {
          failedAt: params.now(),
          errorCode: code,
          errorMessage: message,
        },
        store: params.stateStore,
      });
    } catch {
      try {
        await casTransition({
          discussionId: params.discussionId,
          from: 'created',
          to: 'failed',
          updates: {
            failedAt: params.now(),
            errorCode: code,
            errorMessage: message,
          },
          store: params.stateStore,
        });
      } catch {
        // Ignore terminal transition failures while cleaning up.
      }
    }
  }

  await releaseLock(
    params.discussionId,
    params.lockHolder,
    {
      status: 'failed',
      errorCode: code,
      errorMessage: message,
    },
    params.lockStore
  ).catch(() => undefined);

  params.hub.error(params.discussionId, message);
}

function validateParticipants(discussion: DiscussionRuntimeRecord): void {
  if (discussion.modelIds.length < MIN_PARTICIPANT_MODELS) {
    throw new OrchestratorError(
      'Consensus discussions require at least two participant models',
      'INSUFFICIENT_MODEL_COUNT'
    );
  }
}

async function loadDiscussionOrThrow(
  discussionId: string,
  repository: ConsensusRepository
): Promise<DiscussionRuntimeRecord> {
  const discussion = await repository.getDiscussion(discussionId);

  if (!discussion) {
    throw new OrchestratorError(`Discussion ${discussionId} was not found`, 'DISCUSSION_NOT_FOUND');
  }

  return discussion;
}

function formatResponse(response: RoundModelResponse): string {
  return `${response.modelId}\n${response.text}`.trim();
}

function inferErrorType(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('timeout')) {
    return 'timeout';
  }

  if (normalized.includes('rate')) {
    return 'rate_limited';
  }

  if (normalized.includes('interrupt')) {
    return 'stream_interrupted';
  }

  if (normalized.includes('filter')) {
    return 'output_filtered';
  }

  return 'server_error';
}

function createZeroBillingResolver(): BillingResolver {
  return {
    async resolveForDiscussion() {
      return {
        raw_cost: 0,
        platform_price: 0,
      };
    },
  };
}

async function createDefaultConsensusRepository(): Promise<ConsensusRepository> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  return {
    async getDiscussion(discussionId) {
      const records = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, discussionId))
        .limit(1);

      const conversation = records[0];
      if (!conversation) {
        return null;
      }

      return {
        id: conversation.id,
        conversationId: conversation.id,
        topic: conversation.topic ?? '',
        status: conversation.status,
        currentRound: conversation.currentRound ?? 0,
        lastCompletedRound: conversation.lastCompletedRound ?? 0,
        modelIds: Array.isArray(conversation.models)
          ? conversation.models.filter((modelId): modelId is string => typeof modelId === 'string')
          : [],
        summary: conversation.summary as DiscussionSummaryFinal | null,
      };
    },
    async saveRound(record) {
      const existing = await db
        .select({ id: schema.discussionRounds.id })
        .from(schema.discussionRounds)
        .where(
          and(
            eq(schema.discussionRounds.conversationId, record.discussionId),
            eq(schema.discussionRounds.round, record.roundNumber)
          )
        )
        .limit(1);

      const completedModels = record.modelResponses.map((response) => response.modelId);
      const failedModels = record.failedModels ?? [];
      const skippedModels = failedModels
        .filter((failure) => failure.action === 'skipped')
        .map((failure) => failure.logical_model_id);
      const totalModels = completedModels.length + failedModels.length;
      const startedAt = record.startedAt ?? new Date();
      const completedAt = record.completedAt ?? null;
      const durationMs =
        completedAt === null ? null : Math.max(0, completedAt.getTime() - startedAt.getTime());
      const roundTraceId = `${record.discussionId}:round:${record.roundNumber}`;

      if (existing.length > 0) {
        await db
          .update(schema.discussionRounds)
          .set({
            conversationId: record.discussionId,
            round: record.roundNumber,
            status: record.status,
            completedModels,
            skippedModels,
            failedModels,
            totalModels,
            roundTraceId,
            startedAt,
            completedAt,
            durationMs,
          })
          .where(eq(schema.discussionRounds.id, existing[0].id));
        return;
      }

      await db.insert(schema.discussionRounds).values({
        conversationId: record.discussionId,
        round: record.roundNumber,
        status: record.status,
        completedModels,
        skippedModels,
        failedModels,
        totalModels,
        roundTraceId,
        startedAt,
        completedAt,
        durationMs,
      });
    },
    async saveSummary(discussionId, summary) {
      await db
        .update(schema.conversations)
        .set({
          summary,
          updatedAt: new Date(),
        })
        .where(eq(schema.conversations.id, discussionId));
    },
  };
}

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
}): Promise<void> {
  const repository = params.repository ?? (await createDefaultConsensusRepository());
  const promptStore = params.promptStore ?? (await createDefaultPromptTemplateStore());
  const client = params.client ?? createOpenRouterClient();
  const hub = createStreamHub(params.onEvent);
  const lockHolder = `${params.actor.source}:${params.actor.userId}`;
  const billingResolver = params.billingResolver ?? createZeroBillingResolver();
  const now = params.now ?? (() => new Date());

  const lockAcquired = await acquireLock(params.discussionId, lockHolder, params.lockStore);
  if (!lockAcquired) {
    throw new OrchestratorError(
      `Discussion ${params.discussionId} is already running`,
      'EXECUTION_LOCK_CONFLICT'
    );
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
      },
      store: params.stateStore,
    });

    if (!started) {
      throw new OrchestratorError(
        `Discussion ${discussion.id} could not transition from created to streaming`,
        'DISCUSSION_STATE_CONFLICT'
      );
    }

    hub.progress(discussion.id, 1, 'starting');

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
    hub.roundDone(discussion.id, 1);

    const mappings = await anonymizeModels({
      discussionId: discussion.id,
      modelIds: discussion.modelIds,
    });
    hub.anonymize(
      discussion.id,
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
    hub.roundDone(discussion.id, 2);

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
        currentRound: 4,
        lastCompletedRound: 3,
      },
      store: params.stateStore,
    });
    hub.roundDone(discussion.id, 3);

    const secretarySummary = await runSecretarySummary({
      discussionId: discussion.id,
      secretaryModelId: discussion.modelIds[0],
      topic: discussion.topic,
      context: [round1, round2, round3]
        .flatMap((round) => round.responses)
        .map(formatResponse)
        .join('\n\n'),
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
        currentRound: 4,
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
  await params.repository.saveRound({
    discussionId: params.discussion.id,
    roundNumber: params.roundNumber,
    roundType: params.roundType,
    status: 'running',
    modelResponses: [],
    startedAt,
  });

  const settled = await Promise.allSettled(
    params.discussion.modelIds.map(async (modelId) => {
      const template = await params.promptStore.getActiveTemplate({
        modelId,
        mode: params.promptMode,
        role: 'participant',
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
          params.hub.modelDone(params.discussion.id, modelId, result.usage.completionTokens);
          return {
            modelId,
            text: fullText,
            tokens: result.usage.completionTokens,
          } satisfies RoundModelResponse;
        }

        if (next.value.text) {
          fullText += next.value.text;
          params.hub.chunk(params.discussion.id, modelId, next.value.text);
        }
      }
    })
  );

  const responses: RoundModelResponse[] = [];
  const failures: Array<{ modelId: string; errorMessage: string }> = [];

  settled.forEach((result, index) => {
    const modelId = params.discussion.modelIds[index];

    if (result.status === 'fulfilled') {
      responses.push(result.value);
      return;
    }

    const errorMessage =
      result.reason instanceof Error ? result.reason.message : 'Unknown model execution error';

    params.hub.modelError(params.discussion.id, modelId, errorMessage);
    failures.push({ modelId, errorMessage });
  });

  if (responses.length < MIN_PARTICIPANT_MODELS) {
    await params.repository.saveRound({
      discussionId: params.discussion.id,
      roundNumber: params.roundNumber,
      roundType: params.roundType,
      status: 'failed',
      modelResponses: responses,
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
    roundType: params.roundType,
    status: 'completed',
    modelResponses: responses,
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
        .from(schema.discussions)
        .where(eq(schema.discussions.id, discussionId))
        .limit(1);

      const discussion = records[0];
      if (!discussion) {
        return null;
      }

      return {
        id: discussion.id,
        conversationId: discussion.conversationId,
        topic: discussion.topic,
        status: discussion.status,
        currentRound: discussion.currentRound,
        lastCompletedRound: discussion.lastCompletedRound,
        modelIds: Array.isArray(discussion.modelIds)
          ? discussion.modelIds.filter((modelId): modelId is string => typeof modelId === 'string')
          : [],
        summary: discussion.summary as DiscussionSummaryFinal | null,
      };
    },
    async saveRound(record) {
      const existing = await db
        .select({ id: schema.discussionRounds.id })
        .from(schema.discussionRounds)
        .where(
          and(
            eq(schema.discussionRounds.discussionId, record.discussionId),
            eq(schema.discussionRounds.roundNumber, record.roundNumber)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.discussionRounds)
          .set({
            roundType: record.roundType,
            status: record.status,
            modelResponses: record.modelResponses,
            startedAt: record.startedAt,
            completedAt: record.completedAt,
          })
          .where(eq(schema.discussionRounds.id, existing[0].id));
        return;
      }

      await db.insert(schema.discussionRounds).values({
        discussionId: record.discussionId,
        roundNumber: record.roundNumber,
        roundType: record.roundType,
        status: record.status,
        modelResponses: record.modelResponses,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
      });
    },
    async saveSummary(discussionId, summary) {
      await db
        .update(schema.discussions)
        .set({
          summary,
          updatedAt: new Date(),
        })
        .where(eq(schema.discussions.id, discussionId));
    },
  };
}

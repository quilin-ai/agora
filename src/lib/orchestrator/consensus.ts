import { and, eq, sql } from 'drizzle-orm';

import type {
  ActorContext,
  CompressedRoundState,
  DiscussionSummaryFinal,
  RoundNumber,
  RoundType,
  SSEEvent,
} from '@/lib/types';
import { loadAgoraModelConfig } from '@/lib/config/models';
import { prepareGroundingContext, buildConsensusGroundingRoleDescription } from '@/lib/grounding/service';
import { createOpenRouterClient } from '@/lib/openrouter/client';

import { anonymizeModels, anonymizeRoundResponsesForReviewer } from './anonymizer';
import {
  compressRoundState,
  serializeCompressedState,
  serializeCompressedStates,
} from './context-manager';
import { acquireLock, releaseLock } from './execution-lock';
import {
  createDefaultPromptTemplateStore,
  renderPromptTemplate,
  runSecretaryRoundSummary,
  runSecretarySummary,
} from './secretary';
import { buildRoundPromptVariables } from './prompt-variables';
import { casTransition } from './state-machine';
import {
  createStreamHub,
  ROUND_RULES,
  streamWithRetry,
} from './stream-hub';
import type {
  AnonymizationMapping,
  BillingResolver,
  ConsensusRepository,
  DiscussionRuntimeRecord,
  ExecutionLockStore,
  OpenRouterClient,
  PromptTemplateStore,
  RoundModelResponse,
  RoundExecutionResult,
  StreamHub,
  DiscussionStateStore,
} from './types';
import { OrchestratorError } from './types';

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

    hub.progress(discussion.id, 1, 'background_research');
    const grounding = await prepareGroundingContext({
      topic: discussion.topic,
      scenario: 'council',
      defaultModel: resolveSecretaryModelId(discussion.modelIds),
      client,
    });
    hub.progress(discussion.id, 1, 'independent');

    const round1 = await executeRound({
      discussion,
      roundNumber: 1,
      roundType: 'independent',
      context: grounding.used ? grounding.brief : `Topic:\n${discussion.topic}`,
      roleDescription: buildConsensusGroundingRoleDescription(grounding),
      previousStates: [],
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
      skippedModels: extractSkippedModels(round1.failures),
      failedModels: round1.failures,
      totalModels: discussion.modelIds.length,
    });
    await emitRoundSecretarySummary({
      discussion,
      round: 1,
      context: serializeCompressedStates([round1.compressedState]),
      promptStore,
      client,
      hub,
      now,
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

    const round2 = await executeRound({
      discussion,
      roundNumber: 2,
      roundType: 'review',
      context: (modelId) => anonymizeRoundResponsesForReviewer(round1.responses, mappings, modelId),
      previousStates: [round1.compressedState],
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
      skippedModels: extractSkippedModels(round2.failures),
      failedModels: round2.failures,
      totalModels: discussion.modelIds.length,
    });
    await emitRoundSecretarySummary({
      discussion,
      round: 2,
      context: serializeCompressedStates([round1.compressedState, round2.compressedState]),
      promptStore,
      client,
      hub,
      now,
    });

    hub.progress(discussion.id, 3, 'rebuttal');
    const round1Summary = serializeCompressedState(round1.compressedState);

    const round3 = await executeRound({
      discussion,
      roundNumber: 3,
      roundType: 'rebuttal',
      // Round 3 rebuts the actual round-2 review text (anonymized, self excluded),
      // grounded by round-1's compressed summary — not a lossy merged heuristic digest.
      context: (modelId) =>
        buildRebuttalContext({
          round2Responses: round2.responses,
          mappings,
          reviewerModelId: modelId,
          round1Summary,
        }),
      previousStates: [round1.compressedState, round2.compressedState],
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
      skippedModels: extractSkippedModels(round3.failures),
      failedModels: round3.failures,
      totalModels: discussion.modelIds.length,
    });
    hub.progress(discussion.id, 3, 'secretary_summary');

    const secretarySummary = await runSecretarySummary({
      discussionId: discussion.id,
      secretaryModelId: resolveSecretaryModelId(discussion.modelIds),
      topic: discussion.topic,
      context: serializeCompressedStates([
        round1.compressedState,
        round2.compressedState,
        round3.compressedState,
      ]),
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

async function emitRoundSecretarySummary(params: {
  discussion: DiscussionRuntimeRecord;
  round: RoundNumber;
  context: string;
  promptStore: PromptTemplateStore;
  client: OpenRouterClient;
  hub: StreamHub;
  now: () => Date;
}): Promise<void> {
  params.hub.progress(params.discussion.id, params.round, 'round_summary');

  const summary = await runSecretaryRoundSummary({
    discussionId: params.discussion.id,
    round: params.round,
    secretaryModelId: resolveRoundSummaryModelId(params.discussion.modelIds),
    topic: params.discussion.topic,
    context: params.context,
    participantModelIds: params.discussion.modelIds,
    promptStore: params.promptStore,
    client: params.client,
    now: params.now,
  });

  params.hub.roundSummary(
    params.discussion.id,
    params.round,
    params.round < 3 ? (params.round + 1) as RoundNumber : null,
    summary
  );
}

async function executeRound(params: {
  discussion: DiscussionRuntimeRecord;
  roundNumber: RoundNumber;
  roundType: RoundType;
  context: string | ((modelId: string) => string);
  roleDescription?: string;
  previousStates: CompressedRoundState[];
  promptStore: PromptTemplateStore;
  client: OpenRouterClient;
  repository: ConsensusRepository;
  hub: StreamHub;
  now: () => Date;
}): Promise<RoundExecutionResult> {
  const startedAt = params.now();
  const prompts = await Promise.all(
    params.discussion.modelIds.map(async (modelId) => {
      const template = await params.promptStore.getActiveTemplate({
        modelId,
        mode: 'consensus',
        role: 'participant',
        roundType: params.roundType,
      });

      const context =
        typeof params.context === 'function' ? params.context(modelId) : params.context;

      return {
        modelId,
        prompt: renderPromptTemplate(
          template.content,
          buildRoundPromptVariables({
            discussionId: params.discussion.id,
            topic: params.discussion.topic,
            context,
            roundType: params.roundType,
            roleDescription: params.roleDescription,
          })
        ),
      };
    })
  );

  const settled = await Promise.all(
    prompts.map(async ({ modelId, prompt }) =>
      streamWithRetry({
        discussionId: params.discussion.id,
        logicalModelId: modelId,
        round: params.roundNumber,
        prompt,
        client: params.client,
        hub: params.hub,
        fallbackModelIds: resolveDegradedModelCandidates({
          logicalModelId: modelId,
          participantModelIds: params.discussion.modelIds,
          pricingData: params.discussion.pricingData,
        }),
        pricingData: params.discussion.pricingData,
      })
    )
  );

  const responses: RoundModelResponse[] = [];
  const failures: RoundExecutionResult['failures'] = [];
  let roundRawCost = 0;
  let roundInputTokens = 0;
  let roundOutputTokens = 0;

  settled.forEach((result) => {
    failures.push(...result.failures);

    if (!result.response) {
      return;
    }

    responses.push(result.response);
    roundRawCost += result.response.rawCost;
    roundInputTokens += result.response.inputTokens;
    roundOutputTokens += result.response.outputTokens;
  });

  roundRawCost = Number(roundRawCost.toFixed(6));
  const compressedState = compressRoundState({
    round: params.roundNumber,
    responses,
    previousStates: params.previousStates,
  });

  if (responses.length < ROUND_RULES.MIN_MODELS_PER_ROUND) {
    await params.repository.saveRound({
      discussionId: params.discussion.id,
      roundNumber: params.roundNumber,
      status: 'failed',
      modelResponses: responses,
      failedModels: failures,
      compressedState,
      roundRawCost,
      roundInputTokens,
      roundOutputTokens,
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
    compressedState,
    roundRawCost,
    roundInputTokens,
    roundOutputTokens,
    startedAt,
    completedAt: params.now(),
  });

  return {
    responses,
    failures,
    compressedState,
    roundRawCost,
    roundInputTokens,
    roundOutputTokens,
  };
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

/**
 * Round 3 上下文：第2轮匿名评审全文（除本人外）+ 第1轮压缩摘要。
 * ponytail: 仓库暂无 token 计数器，用字符预算近似做长度保护，将来接入 tokenizer 时替换即可。
 */
export const REBUTTAL_ROUND2_CHAR_BUDGET = 6000;

export function buildRebuttalContext(params: {
  round2Responses: RoundModelResponse[];
  mappings: AnonymizationMapping[];
  reviewerModelId: string;
  round1Summary: string;
}): string {
  const anonymizedRound2 = anonymizeRoundResponsesForReviewer(
    params.round2Responses,
    params.mappings,
    params.reviewerModelId
  );
  const boundedRound2 =
    anonymizedRound2.length > REBUTTAL_ROUND2_CHAR_BUDGET
      ? `${anonymizedRound2.slice(0, REBUTTAL_ROUND2_CHAR_BUDGET)}\n…（前文过长，已按长度预算截断）`
      : anonymizedRound2;

  return [
    '【第2轮匿名评审全文（除你本人外）】',
    boundedRound2,
    '',
    '【第1轮压缩摘要】',
    params.round1Summary,
  ].join('\n');
}

function validateParticipants(discussion: DiscussionRuntimeRecord): void {
  if (discussion.modelIds.length < ROUND_RULES.MIN_MODELS_PER_ROUND) {
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

function extractSkippedModels(failures: RoundExecutionResult['failures']): string[] {
  return Array.from(
    new Set(
      failures
        .filter((failure) => failure.action === 'skipped')
        .map((failure) => failure.logical_model_id)
    )
  );
}

function resolveDegradedModelCandidates(params: {
  logicalModelId: string;
  participantModelIds: string[];
  pricingData?: DiscussionRuntimeRecord['pricingData'];
}): string[] {
  const candidateModelIds = (() => {
    try {
      const configuredCandidates = loadAgoraModelConfig().allowedModels;

      if (!params.pricingData) {
        return configuredCandidates;
      }

      const pricedConfiguredCandidates = configuredCandidates.filter(
        (modelId) => params.pricingData?.[modelId]
      );

      return pricedConfiguredCandidates.length > 0
        ? pricedConfiguredCandidates
        : params.participantModelIds;
    } catch {
      return params.participantModelIds;
    }
  })();
  const logicalProvider = params.logicalModelId.split('/')[0];

  return candidateModelIds
    .filter((modelId) => modelId !== params.logicalModelId)
    .sort((left, right) => {
      const leftProviderPenalty = left.startsWith(`${logicalProvider}/`) ? 0 : 1;
      const rightProviderPenalty = right.startsWith(`${logicalProvider}/`) ? 0 : 1;

      if (leftProviderPenalty !== rightProviderPenalty) {
        return leftProviderPenalty - rightProviderPenalty;
      }

      const leftPrice = resolveModelSortPrice(left, params.pricingData);
      const rightPrice = resolveModelSortPrice(right, params.pricingData);

      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      return left.localeCompare(right);
    });
}

function resolveModelSortPrice(
  modelId: string,
  pricingData?: DiscussionRuntimeRecord['pricingData']
): number {
  const pricing = pricingData?.[modelId];

  if (!pricing) {
    return Number.POSITIVE_INFINITY;
  }

  return pricing.input + pricing.output;
}

function resolveSecretaryModelId(participantModelIds: string[]): string {
  try {
    return loadAgoraModelConfig().secretaryModel;
  } catch {
    return participantModelIds[0] ?? '';
  }
}

function resolveRoundSummaryModelId(participantModelIds: string[]): string {
  try {
    const config = loadAgoraModelConfig();

    if (config.roundSummaryModel && !participantModelIds.includes(config.roundSummaryModel)) {
      return config.roundSummaryModel;
    }

    const fallback = config.allowedModels.find((modelId) => !participantModelIds.includes(modelId));
    if (fallback) {
      return fallback;
    }

    return config.secretaryModel;
  } catch {
    return participantModelIds[0] ?? '';
  }
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
        billingSnapshotId: conversation.billingSnapshotId,
        pricingData: conversation.billingSnapshotId
          ? await loadBillingSnapshotPricing(schema, conversation.billingSnapshotId, db)
          : null,
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
      const skippedModels = Array.from(
        new Set(
          failedModels
            .filter((failure) => failure.action === 'skipped')
            .map((failure) => failure.logical_model_id)
        )
      );
      const totalModels = new Set([
        ...completedModels,
        ...failedModels.map((failure) => failure.logical_model_id),
      ]).size;
      const compressedState = record.compressedState ?? null;
      const roundRawCost = Number((record.roundRawCost ?? 0).toFixed(6));
      const roundInputTokens = record.roundInputTokens ?? 0;
      const roundOutputTokens = record.roundOutputTokens ?? 0;
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
            compressedState,
            roundRawCost: roundRawCost.toFixed(6),
            roundInputTokens,
            roundOutputTokens,
            roundTraceId,
            startedAt,
            completedAt,
            durationMs,
          })
          .where(eq(schema.discussionRounds.id, existing[0].id));
        await updateConversationUsageTotals(db, schema, record.discussionId);
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
        compressedState,
        roundRawCost: roundRawCost.toFixed(6),
        roundInputTokens,
        roundOutputTokens,
        roundTraceId,
        startedAt,
        completedAt,
        durationMs,
      });

      await updateConversationUsageTotals(db, schema, record.discussionId);
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

async function loadBillingSnapshotPricing(
  schema: typeof import('@/lib/db/schema'),
  billingSnapshotId: string,
  db: (typeof import('@/lib/db/index'))['db']
): Promise<DiscussionRuntimeRecord['pricingData']> {
  const snapshots = await db
    .select({
      pricingData: schema.billingSnapshots.pricingData,
    })
    .from(schema.billingSnapshots)
    .where(eq(schema.billingSnapshots.id, billingSnapshotId))
    .limit(1);

  return snapshots[0]?.pricingData ?? null;
}

async function updateConversationUsageTotals(
  db: (typeof import('@/lib/db/index'))['db'],
  schema: typeof import('@/lib/db/schema'),
  discussionId: string
): Promise<void> {
  const totals = await db
    .select({
      totalRawCost: sql<string>`coalesce(sum(${schema.discussionRounds.roundRawCost}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${schema.discussionRounds.roundInputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${schema.discussionRounds.roundOutputTokens}), 0)`,
    })
    .from(schema.discussionRounds)
    .where(eq(schema.discussionRounds.conversationId, discussionId))
    .limit(1);

  const aggregate = totals[0];

  await db
    .update(schema.conversations)
    .set({
      totalRawCost: aggregate?.totalRawCost ?? '0',
      totalInputTokens: aggregate?.totalInputTokens ?? 0,
      totalOutputTokens: aggregate?.totalOutputTokens ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversations.id, discussionId));
}

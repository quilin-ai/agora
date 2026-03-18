import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';

import type { Command } from 'commander';
import { desc, eq } from 'drizzle-orm';

import { createCliEventRenderer, createCliStatusIndicator } from '@/cli/display';
import { createEventLogger } from '@/cli/event-logger';
import {
  loadAgoraModelConfig,
  ModelConfigError,
  resolveCouncilModels,
} from '@/lib/config/models';
import {
  DatabaseConnectionError,
  ensureDatabaseReady,
  getDatabaseConnectionDiagnostics,
} from '@/lib/db/index';
import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import { createDefaultPromptTemplateStore } from '@/lib/orchestrator/secretary';
import { PromptTemplateMissingError } from '@/lib/orchestrator/types';
import {
  PLAN_LIMITS,
  assertPlanDailyLimit,
  countDiscussionsCreatedToday,
  findRecentTopicHashMatch,
  type RecentTopicHashMatch,
  RiskControlError,
  shouldEnforceTopicDedup,
  validateTopicInput,
} from '@/lib/security/risk-control';
import type { ConversationStatus, DiscussionSummaryFinal, SSEEvent } from '@/lib/types';
import { toDoneEventData, toRestoreEventData } from '@/lib/types';

const OBSERVER_POLL_INTERVAL_MS = 1_000;
const OBSERVER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

interface CouncilRunOptions {
  topic?: string;
  models?: string[];
  discussionId?: string;
}

interface CliUserRecord {
  id: string;
  plan: keyof typeof PLAN_LIMITS;
}

interface DiscussionSnapshot {
  id: string;
  status: ConversationStatus;
  currentRound: number;
  lastCompletedRound: number;
  summary: DiscussionSummaryFinal | null;
  totalRawCost: number;
  totalPlatformPrice: number;
  errorCode: string | null;
  errorMessage: string | null;
}

class CouncilRunCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CouncilRunCancelledError';
  }
}

export function registerCouncilCommands(program: Command): void {
  const council = program
    .command('council')
    .description('Council discussion commands');

  council
    .command('run')
    .description('Run a council discussion')
    .option('-t, --topic <topic>', 'Discussion topic')
    .option('-m, --models <models...>', 'Model IDs to participate')
    .option('-d, --discussion-id <discussionId>', 'Attach to an existing discussion')
    .action(async (options: CouncilRunOptions) => {
      try {
        await handleCouncilRun(options);
      } catch (error) {
        processCouncilRunError(error);
      }
    });
}

async function handleCouncilRun(options: CouncilRunOptions): Promise<void> {
  const startupIndicator = createCliStatusIndicator();

  try {
    startupIndicator.start('[council run] Checking database and runtime', {
      milestones: [
        {
          afterMs: 3_000,
          message: '[council run] Still preparing runtime',
        },
        {
          afterMs: 8_000,
          message: '[council run] Startup is slower than usual, waiting on DB or prompt templates',
        },
      ],
    });
    await ensureDatabaseReady({
      label: 'council run startup',
    });

    const config = loadAgoraModelConfig();
    const dbDiagnostics = getDatabaseConnectionDiagnostics();
    startupIndicator.update('[council run] Loading CLI user and billing configuration');
    const cliUser = await loadCliUser();
    let participantModels: string[] = [];
    let discussionId = options.discussionId;

    if (!discussionId) {
      participantModels = resolveCouncilModels({
        config,
        requestedModels: options.models,
      });

      await assertPromptTemplatesReady({
        participantModels,
        secretaryModelId: config.secretaryModel,
      });

      startupIndicator.update('[council run] Creating discussion record');
      discussionId = await createDiscussionForTopic({
        cliUser,
        billingSnapshotId: await loadBillingSnapshotId(),
        topic: options.topic,
        participantModels,
      });
    }

    const logger = await createEventLogger({ discussionId });
    const renderer = createCliEventRenderer({
      getPanelModelIds: () => participantModels,
    });
    let logChain = Promise.resolve();
    let terminalSeen = false;
    let summarySeen = false;

    const terminal = createTerminalLatch();
    const onEvent = (event: SSEEvent) => {
      renderer.render(event);
      logChain = logChain
        .then(() => logger.log(event))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[council run] Event log failure: ${message}`);
        });

      if (event.type === 'summary') {
        summarySeen = true;
      }

      if (event.type === 'done' || event.type === 'error') {
        terminalSeen = true;
        terminal.resolve(event);
      }
    };

    startupIndicator.update(`[council run] Attaching to discussion ${discussionId}`);
    const { role, discussion, execution } = await startOrAttachDiscussion({
      actor: { userId: cliUser.id, source: 'cli' },
      discussionId,
      onEvent,
    });

    if (startupIndicator.isActive()) {
      startupIndicator.succeed(`[council run] Session attached as ${role}`);
    }

    participantModels = participantModels.length > 0 ? participantModels : discussion.models;

    console.log(`[council run] Discussion ID: ${discussionId}`);
    console.log(`[council run] Secretary model: ${config.secretaryModel}`);
    console.log(
      `[council run] Round summary model: ${config.roundSummaryModel ?? '(auto non-participant fallback)'}`
    );
    console.log(
      `[council run] Database connection: ${dbDiagnostics.active.source} (${dbDiagnostics.active.label})`
    );
    console.log(`[council run] Event log: ${logger.getFilePath()}`);
    console.log(`[council run] Session role: ${role}`);
    console.log(`[council run] Active discussion models: ${participantModels.join(', ')}`);

    if (role === 'observer') {
      const observerIndicator = createCliStatusIndicator();

      onEvent({
        type: 'restore',
        data: toRestoreEventData({
          status: discussion.status,
          currentRound: discussion.current_round,
          lastCompletedRound: discussion.last_completed_round,
        }),
      });

      observerIndicator.start(`[council run] Waiting for discussion ${discussion.id} to finish`, {
        milestones: [
          {
            afterMs: 10_000,
            message: `[council run] Discussion ${discussion.id} is still running`,
          },
          {
            afterMs: 30_000,
            message: `[council run] Models are still debating in discussion ${discussion.id}`,
          },
          {
            afterMs: 60_000,
            message: `[council run] Discussion ${discussion.id} is taking longer than usual`,
          },
        ],
      });

      let snapshot: DiscussionSnapshot;

      try {
        snapshot = await waitForObserverCompletion(discussion.id);
        observerIndicator.succeed(
          `[council run] Discussion ${discussion.id} reached ${snapshot.status}`
        );
      } catch (error) {
        if (observerIndicator.isActive()) {
          observerIndicator.fail(
            `[council run] Waiting for discussion ${discussion.id} failed`
          );
        }

        throw error;
      }

      if (snapshot.summary && !summarySeen) {
        onEvent({
          type: 'summary',
          data: {
            ...snapshot.summary,
            seq: 0,
          },
        });
      }

      if (!terminalSeen) {
        if (snapshot.status === 'completed') {
          onEvent({
            type: 'done',
            data: toDoneEventData(
              {
                raw_cost: snapshot.totalRawCost,
                platform_price: snapshot.totalPlatformPrice,
              },
              0
            ),
          });
        } else {
          onEvent({
            type: 'error',
            data: {
              code: snapshot.errorCode ?? 'DISCUSSION_NOT_COMPLETED',
              message: snapshot.errorMessage ?? `Discussion ended with status ${snapshot.status}`,
            },
          });
        }
      }
    }

    const terminalEvent = await terminal.promise;
    if (execution) {
      await execution;
    }
    await logChain;

    if (terminalEvent.type === 'error') {
      throw new Error(terminalEvent.data.message);
    }
  } catch (error) {
    if (startupIndicator.isActive()) {
      startupIndicator.fail('[council run] Startup failed');
    }

    throw error;
  } finally {
    await shutdownDbClient();
  }
}

async function assertPromptTemplatesReady(params: {
  participantModels: string[];
  secretaryModelId: string;
}): Promise<void> {
  const promptStore = await createDefaultPromptTemplateStore();
  const lookups = [
    ...params.participantModels.flatMap((modelId) => [
      { modelId, mode: 'consensus', role: 'participant', roundType: 'independent' },
      { modelId, mode: 'consensus', role: 'participant', roundType: 'review' },
      { modelId, mode: 'consensus', role: 'participant', roundType: 'rebuttal' },
    ]),
    {
      modelId: params.secretaryModelId,
      mode: 'consensus',
      role: 'secretary',
      roundType: 'summary',
    },
  ] as const;

  const missing: string[] = [];

  for (const lookup of lookups) {
    try {
      await promptStore.getActiveTemplate(lookup);
    } catch (error) {
      if (error instanceof PromptTemplateMissingError) {
        missing.push(
          `${lookup.modelId} mode=${lookup.mode} role=${lookup.role} roundType=${lookup.roundType}`
        );
        continue;
      }

      throw error;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing active prompt templates for: ${missing.join('; ')}. Seed prompt_templates before running council discussions.`
    );
  }
}

async function createDiscussionForTopic(params: {
  cliUser: CliUserRecord;
  billingSnapshotId: string;
  topic?: string;
  participantModels: string[];
}): Promise<string> {
  if (!params.topic?.trim()) {
    throw new Error('Topic is required unless --discussion-id is provided');
  }

  if (params.participantModels.length > PLAN_LIMITS[params.cliUser.plan].maxModels) {
    throw new Error(
      `${params.cliUser.plan} plan allows at most ${PLAN_LIMITS[params.cliUser.plan].maxModels} council models`
    );
  }

  const { normalizedTopic, topicHash, riskLevel } = validateTopicInput({
    topic: params.topic,
    mode: 'council',
  });

  const usedToday = await countDiscussionsCreatedToday({
    userId: params.cliUser.id,
    mode: 'council',
  });

  assertPlanDailyLimit({
    plan: params.cliUser.plan,
    mode: 'council',
    usedToday,
  });

  if (shouldEnforceTopicDedup()) {
    const duplicate = await findRecentTopicHashMatch({
      userId: params.cliUser.id,
      topicHash,
    });

    if (duplicate) {
      const resolution = await resolveDuplicateTopicForCli({
        duplicate,
        requestedTopic: params.topic.trim(),
      });

      if (resolution === 'reuse') {
        return duplicate.discussionId;
      }

      if (resolution === 'cancel') {
        throw new CouncilRunCancelledError('Cancelled after duplicate topic prompt');
      }
    }
  }

  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const discussionId = randomUUID();

  await db.insert(schema.conversations).values({
    id: discussionId,
    userId: params.cliUser.id,
    type: 'council',
    mode: 'consensus',
    status: 'created',
    currentRound: 0,
    lastCompletedRound: 0,
    maxRounds: 3,
    models: params.participantModels,
    title: normalizedTopic.slice(0, 80),
    topic: params.topic.trim(),
    topicHash,
    billingSnapshotId: params.billingSnapshotId,
    riskLevel,
    visibility: 'private',
  });

  return discussionId;
}

async function resolveDuplicateTopicForCli(params: {
  duplicate: RecentTopicHashMatch;
  requestedTopic: string;
}): Promise<'reuse' | 'new' | 'cancel'> {
  const createdAt = params.duplicate.createdAt.toISOString();
  const preview = params.duplicate.title ?? params.duplicate.topic ?? params.requestedTopic;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new RiskControlError(
      'INVALID_INPUT',
      `A similar topic already exists in the last 24 hours. Re-run with -d ${params.duplicate.discussionId} to reuse it, or provide a more specific topic to create a new discussion.`
    );
  }

  console.log('[council run] A substantially similar topic already exists in the last 24 hours.');
  console.log(`[council run] Existing discussion: ${params.duplicate.discussionId}`);
  console.log(`[council run] Existing status: ${params.duplicate.status}`);
  console.log(`[council run] Existing created_at: ${createdAt}`);
  console.log(`[council run] Existing topic: ${preview}`);
  console.log('[council run] Choose: [r] reuse history / [n] create new anyway / [c] cancel');

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = (await readline.question('[council run] Your choice (r/n/c, default r): '))
        .trim()
        .toLowerCase();

      if (answer === '' || answer === 'r' || answer === 'reuse') {
        return 'reuse';
      }

      if (answer === 'n' || answer === 'new') {
        return 'new';
      }

      if (answer === 'c' || answer === 'cancel') {
        return 'cancel';
      }

      console.log('[council run] Invalid choice. Enter r, n, or c.');
    }
  } finally {
    readline.close();
  }
}

async function loadCliUser(): Promise<CliUserRecord> {
  const cliUserId = process.env.CLI_TEST_USER_ID?.trim();

  if (!cliUserId) {
    throw new Error('CLI_TEST_USER_ID is required for CLI phase runs');
  }

  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const existing = await db
    .select({
      id: schema.users.id,
      plan: schema.users.plan,
    })
    .from(schema.users)
    .where(eq(schema.users.id, cliUserId))
    .limit(1);

  const row = existing[0];

  if (!row) {
    throw new Error(
      `CLI test user ${cliUserId} was not found. Seed users before running council discussions.`
    );
  }

  return {
    id: row.id,
    plan: normalizePlan(row.plan),
  };
}

async function loadBillingSnapshotId(): Promise<string> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const rows = await db
    .select({
      id: schema.billingSnapshots.id,
    })
    .from(schema.billingSnapshots)
    .orderBy(desc(schema.billingSnapshots.effectiveFrom))
    .limit(1);

  const snapshot = rows[0];

  if (!snapshot) {
    throw new Error('billing_snapshots is empty. Seed billing snapshots before running council discussions.');
  }

  return snapshot.id;
}

async function waitForObserverCompletion(discussionId: string): Promise<DiscussionSnapshot> {
  const deadline = Date.now() + OBSERVER_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const snapshot = await loadDiscussionSnapshot(discussionId);

    if (!snapshot) {
      throw new Error(`Discussion ${discussionId} was not found while observing`);
    }

    if (isTerminalStatus(snapshot.status)) {
      return snapshot;
    }

    await delay(OBSERVER_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out while waiting for discussion ${discussionId} to finish`);
}

async function loadDiscussionSnapshot(discussionId: string): Promise<DiscussionSnapshot | null> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const rows = await db
    .select({
      id: schema.conversations.id,
      status: schema.conversations.status,
      currentRound: schema.conversations.currentRound,
      lastCompletedRound: schema.conversations.lastCompletedRound,
      summary: schema.conversations.summary,
      totalRawCost: schema.conversations.totalRawCost,
      totalPlatformPrice: schema.conversations.totalPlatformPrice,
      errorCode: schema.conversations.errorCode,
      errorMessage: schema.conversations.errorMessage,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, discussionId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    currentRound: row.currentRound ?? 0,
    lastCompletedRound: row.lastCompletedRound ?? 0,
    summary: (row.summary as DiscussionSummaryFinal | null) ?? null,
    totalRawCost: Number(row.totalRawCost ?? '0'),
    totalPlatformPrice: Number(row.totalPlatformPrice ?? '0'),
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

function createTerminalLatch(): {
  promise: Promise<SSEEvent>;
  resolve: (event: SSEEvent) => void;
} {
  let resolve!: (event: SSEEvent) => void;
  const promise = new Promise<SSEEvent>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function normalizePlan(value: string | null | undefined): keyof typeof PLAN_LIMITS {
  return value && value in PLAN_LIMITS ? (value as keyof typeof PLAN_LIMITS) : 'free';
}

function isTerminalStatus(status: ConversationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

async function shutdownDbClient(): Promise<void> {
  try {
    const { dbClient } = await import('@/lib/db/index');
    await dbClient.end({ timeout: 0 });
  } catch {
    // Ignore client shutdown issues during CLI teardown.
  }
}

function processCouncilRunError(error: unknown): void {
  if (error instanceof DatabaseConnectionError) {
    console.error(`[council run] Database connection error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof ModelConfigError) {
    console.error(`[council run] Model configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof RiskControlError) {
    console.error(`[council run] Risk control error (${error.code}): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof CouncilRunCancelledError) {
    console.error(`[council run] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[council run] ${message}`);
  process.exitCode = 1;
}

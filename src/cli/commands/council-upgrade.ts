/**
 * agora council upgrade — 从单模型 chat 会话升级为议会讨论
 *
 * 流程：
 * 1. 读取原 chat 的最近 N 条 messages
 * 2. 用 LLM 压缩为 topic summary
 * 3. 创建新 council conversation（parent_id + fork_point_message_id）
 * 4. 执行标准 runConsensusDiscussion
 */

import { randomUUID } from 'node:crypto';

import type { Command } from 'commander';
import { asc, desc, eq } from 'drizzle-orm';

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
} from '@/lib/db/index';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import type { SSEEvent } from '@/lib/types';
import { toDoneEventData } from '@/lib/types';

const UPGRADE_CONTEXT_MESSAGES = 10;

interface UpgradeOptions {
  models?: string[];
}

export function registerCouncilUpgradeCommand(council: Command): void {
  council
    .command('upgrade <chatConversationId>')
    .description('Upgrade a chat conversation to a council discussion')
    .option('-m, --models <models...>', 'Council participant model IDs')
    .action(async (chatConversationId: string, options: UpgradeOptions) => {
      try {
        const config = loadAgoraModelConfig();
        const models = resolveCouncilModels({
          config,
          requestedModels: options.models,
        });

        await ensureDatabaseReady({ label: 'council upgrade startup' });

        const renderer = createCliEventRenderer({
          getPanelModelIds: () => models,
        });

        await upgradeToCouncil({
          chatConversationId,
          models,
          onEvent: (event) => renderer.render(event),
        });
      } catch (error) {
        processUpgradeError(error);
      } finally {
        await shutdownDbClient();
      }
    });
}

export async function upgradeToCouncil(params: {
  chatConversationId: string;
  models: string[];
  onEvent: (event: SSEEvent) => void;
}): Promise<void> {
  const { chatConversationId, models, onEvent } = params;

  const startupIndicator = createCliStatusIndicator();
  startupIndicator.start('[upgrade] Loading chat conversation');

  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  // Verify chat conversation exists
  const chatRows = await db
    .select({
      id: schema.conversations.id,
      userId: schema.conversations.userId,
      type: schema.conversations.type,
      status: schema.conversations.status,
      billingSnapshotId: schema.conversations.billingSnapshotId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, chatConversationId))
    .limit(1);

  const chatConv = chatRows[0];
  if (!chatConv) {
    throw new Error(`Chat conversation ${chatConversationId} was not found`);
  }

  if (chatConv.type !== 'chat') {
    throw new Error(
      `Conversation ${chatConversationId} is type='${chatConv.type}', expected 'chat'`
    );
  }

  // Load last N messages
  const messageRows = await db
    .select({
      id: schema.messages.id,
      role: schema.messages.role,
      content: schema.messages.content,
      logicalModelId: schema.messages.logicalModelId,
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, chatConversationId))
    .orderBy(asc(schema.messages.createdAt))
    .limit(UPGRADE_CONTEXT_MESSAGES);

  if (messageRows.length === 0) {
    throw new Error('Chat conversation has no messages to upgrade from');
  }

  // Find last message to use as fork_point
  const lastMessageRows = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, chatConversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);

  const forkPointMessageId = lastMessageRows[0]?.id ?? null;

  // Mark fork point
  if (forkPointMessageId) {
    await db
      .update(schema.messages)
      .set({ isForkPoint: true })
      .where(eq(schema.messages.id, forkPointMessageId));
  }

  startupIndicator.update('[upgrade] Compressing chat context to topic summary');

  // Compress chat messages into a topic
  const client = createOpenRouterClient();
  const config = loadAgoraModelConfig();
  const topic = await compressChatToTopic({
    messages: messageRows.map((row) => ({ role: row.role, content: row.content })),
    summaryModel: config.secretaryModel,
    client,
  });

  startupIndicator.update('[upgrade] Creating council discussion');

  // Load billing snapshot
  const billingSnapshotId = chatConv.billingSnapshotId ?? (await loadBillingSnapshotId(db, schema));

  // Create council conversation
  const councilId = randomUUID();
  await db.insert(schema.conversations).values({
    id: councilId,
    userId: chatConv.userId,
    type: 'council',
    mode: 'consensus',
    status: 'created',
    currentRound: 0,
    lastCompletedRound: 0,
    maxRounds: 3,
    models,
    title: topic.slice(0, 80),
    topic,
    billingSnapshotId,
    parentId: chatConversationId,
    forkPointMessageId,
    visibility: 'private',
  });

  startupIndicator.succeed(`[upgrade] Council discussion created: ${councilId}`);
  console.log(`[upgrade] Parent chat: ${chatConversationId}`);
  console.log(`[upgrade] Council ID: ${councilId}`);
  console.log(`[upgrade] Topic: ${topic.slice(0, 120)}`);
  console.log(`[upgrade] Models: ${models.join(', ')}`);

  const logger = await createEventLogger({ discussionId: councilId });
  let logChain = Promise.resolve();
  let terminalSeen = false;
  let summarySeen = false;

  const terminal = createTerminalLatch();
  const wrappedOnEvent = (event: SSEEvent) => {
    onEvent(event);
    logChain = logChain
      .then(() => logger.log(event))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[upgrade] Event log failure: ${msg}`);
      });

    if (event.type === 'summary') summarySeen = true;
    if (event.type === 'done' || event.type === 'error') {
      terminalSeen = true;
      terminal.resolve(event);
    }
  };

  const { execution } = await startOrAttachDiscussion({
    actor: { userId: chatConv.userId, source: 'cli' },
    discussionId: councilId,
    onEvent: wrappedOnEvent,
  });

  const terminalEvent = await terminal.promise;
  if (execution) {
    await execution;
  }
  await logChain;

  if (!terminalSeen) {
    onEvent({
      type: 'done',
      data: toDoneEventData({ raw_cost: 0, platform_price: 0 }, 0),
    });
  }

  void summarySeen; // checked externally by consumer if needed

  if (terminalEvent.type === 'error') {
    throw new Error(terminalEvent.data.message);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function compressChatToTopic(params: {
  messages: Array<{ role: string; content: string }>;
  summaryModel: string;
  client: ReturnType<typeof createOpenRouterClient>;
}): Promise<string> {
  const chatContext = params.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const prompt = `You are a conversation summarizer. Given the following chat conversation, produce a concise topic statement (1-3 sentences) that captures the main question or theme being discussed. Output only the topic statement, no preamble.\n\nConversation:\n${chatContext}`;

  try {
    const result = await params.client.complete({
      model: params.summaryModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const summary = result.text.trim();
    return summary || chatContext.slice(0, 500);
  } catch {
    // Fallback: use first user message as topic
    const firstUser = params.messages.find((m) => m.role === 'user');
    return firstUser?.content?.slice(0, 500) ?? 'Chat upgrade discussion';
  }
}

async function loadBillingSnapshotId(
  db: (typeof import('@/lib/db/index'))['db'],
  schema: typeof import('@/lib/db/schema')
): Promise<string> {
  const rows = await db
    .select({ id: schema.billingSnapshots.id })
    .from(schema.billingSnapshots)
    .orderBy(desc(schema.billingSnapshots.effectiveFrom))
    .limit(1);

  const snapshot = rows[0];
  if (!snapshot) {
    throw new Error(
      'billing_snapshots is empty. Seed billing snapshots before upgrading to council.'
    );
  }

  return snapshot.id;
}

function createTerminalLatch(): {
  promise: Promise<SSEEvent>;
  resolve: (event: SSEEvent) => void;
} {
  let resolve!: (event: SSEEvent) => void;
  const promise = new Promise<SSEEvent>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function shutdownDbClient(): Promise<void> {
  try {
    const { dbClient } = await import('@/lib/db/index');
    await dbClient.end({ timeout: 0 });
  } catch {
    // ignore
  }
}

function processUpgradeError(error: unknown): void {
  if (error instanceof DatabaseConnectionError) {
    console.error(`[upgrade] Database connection error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof ModelConfigError) {
    console.error(`[upgrade] Model configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[upgrade] ${message}`);
  process.exitCode = 1;
}

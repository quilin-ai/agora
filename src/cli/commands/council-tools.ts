/**
 * agora council replay / export / followup
 *
 * replay    — 回放历史讨论事件 JSONL
 * export    — 导出讨论结构化总结（JSON / Markdown）
 * followup  — 对已完成讨论追问（ask_secretary / ask_model / new_council）
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Command } from 'commander';
import { desc, eq } from 'drizzle-orm';

import { createCliEventRenderer, createCliStatusIndicator } from '@/cli/display';
import { createEventLogger } from '@/cli/event-logger';
import { loadAgoraModelConfig, ModelConfigError, resolveCouncilModels } from '@/lib/config/models';
import { DatabaseConnectionError, ensureDatabaseReady } from '@/lib/db/index';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import { startOrAttachDiscussion } from '@/lib/orchestrator/session-starter';
import type { DiscussionSummaryFinal, SSEEvent } from '@/lib/types';

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerCouncilToolCommands(council: Command): void {
  registerReplayCommand(council);
  registerExportCommand(council);
  registerFollowupCommand(council);
}

// ─── replay ───────────────────────────────────────────────────────────────────

function registerReplayCommand(council: Command): void {
  council
    .command('replay [discussionId]')
    .description('Replay events from a saved discussion JSONL log')
    .option('-l, --last', 'Replay the most recent discussion')
    .option('--dir <dir>', 'JSONL sessions directory', '.agora/sessions')
    .action(async (discussionId?: string, options?: { last?: boolean; dir?: string }) => {
      try {
        const dir = options?.dir ?? '.agora/sessions';

        let targetId = discussionId ?? null;
        if (!targetId || options?.last) {
          targetId = findLastDiscussionId(dir);
          if (!targetId) {
            console.error('[replay] No discussion log files found in ' + dir);
            process.exitCode = 1;
            return;
          }
        }

        await handleReplay(targetId, dir);
      } catch (error) {
        processToolError('replay', error);
      }
    });
}

function findLastDiscussionId(dir: string): string | null {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.events.jsonl'));

    if (files.length === 0) return null;

    const sorted = files.sort((a, b) => {
      const statA = statSync(join(dir, a));
      const statB = statSync(join(dir, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    return sorted[0].replace('.events.jsonl', '');
  } catch {
    return null;
  }
}

async function handleReplay(discussionId: string, dir: string): Promise<void> {
  const filePath = join(dir, `${discussionId}.events.jsonl`);

  if (!existsSync(filePath)) {
    throw new Error(`Event log not found: ${filePath}`);
  }

  const raw = await readFile(filePath, 'utf-8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  console.log(`[replay] Discussion: ${discussionId}`);
  console.log(`[replay] Events: ${lines.length}`);
  console.log('[replay] ---');

  const renderer = createCliEventRenderer({ getPanelModelIds: () => [] });

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { timestamp: string; type: string; data: unknown };
      renderer.render({ type: entry.type, data: entry.data } as SSEEvent);
    } catch {
      console.error(`[replay] Failed to parse line: ${line.slice(0, 80)}`);
    }
  }

  console.log('[replay] Done.');
}

// ─── export ───────────────────────────────────────────────────────────────────

function registerExportCommand(council: Command): void {
  council
    .command('export <discussionId>')
    .description('Export a completed discussion summary')
    .option('-f, --format <format>', 'Output format: json | markdown', 'json')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action(
      async (discussionId: string, options: { format?: string; output?: string }) => {
        try {
          await ensureDatabaseReady({ label: 'council export' });
          await handleExport(discussionId, {
            format: (options.format ?? 'json') as 'json' | 'markdown',
            output: options.output,
          });
        } catch (error) {
          processToolError('export', error);
        } finally {
          await shutdownDbClient();
        }
      }
    );
}

async function handleExport(
  discussionId: string,
  options: { format: 'json' | 'markdown'; output?: string }
): Promise<void> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  const rows = await db
    .select({
      id: schema.conversations.id,
      topic: schema.conversations.topic,
      status: schema.conversations.status,
      models: schema.conversations.models,
      summary: schema.conversations.summary,
      totalRawCost: schema.conversations.totalRawCost,
      totalPlatformPrice: schema.conversations.totalPlatformPrice,
      totalInputTokens: schema.conversations.totalInputTokens,
      totalOutputTokens: schema.conversations.totalOutputTokens,
      createdAt: schema.conversations.createdAt,
      completedAt: schema.conversations.completedAt,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, discussionId))
    .limit(1);

  const discussion = rows[0];
  if (!discussion) {
    throw new Error(`Discussion ${discussionId} not found`);
  }

  const output =
    options.format === 'markdown'
      ? formatAsMarkdown(discussion)
      : JSON.stringify(
          {
            id: discussion.id,
            topic: discussion.topic,
            status: discussion.status,
            models: discussion.models,
            summary: discussion.summary,
            billing: {
              total_raw_cost: Number(discussion.totalRawCost ?? 0),
              total_platform_price: Number(discussion.totalPlatformPrice ?? 0),
              total_input_tokens: discussion.totalInputTokens ?? 0,
              total_output_tokens: discussion.totalOutputTokens ?? 0,
            },
            created_at: discussion.createdAt?.toISOString(),
            completed_at: discussion.completedAt?.toISOString() ?? null,
          },
          null,
          2
        );

  if (options.output) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(options.output, output, 'utf-8');
    console.log(`[export] Written to ${options.output}`);
  } else {
    process.stdout.write(output + '\n');
  }
}

function formatAsMarkdown(discussion: {
  id: string;
  topic: string | null;
  status: string;
  models: string[] | null;
  summary: DiscussionSummaryFinal | null;
  totalRawCost: string | null;
  totalPlatformPrice: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
}): string {
  const lines: string[] = [];

  lines.push(`# Agora Council Discussion`);
  lines.push('');
  lines.push(`**Topic:** ${discussion.topic ?? '(no topic)'}`);
  lines.push(`**Status:** ${discussion.status}`);
  lines.push(`**Models:** ${(discussion.models ?? []).join(', ')}`);
  lines.push(`**Created:** ${discussion.createdAt?.toISOString() ?? 'unknown'}`);
  if (discussion.completedAt) {
    lines.push(`**Completed:** ${discussion.completedAt.toISOString()}`);
  }
  lines.push(
    `**Cost:** raw=${discussion.totalRawCost ?? 0}, platform=${discussion.totalPlatformPrice ?? 0}`
  );
  lines.push('');

  const summary = discussion.summary;
  if (!summary) {
    lines.push('*No summary available.*');
    return lines.join('\n');
  }

  if (summary.consensus?.length > 0) {
    lines.push('## Consensus');
    for (const point of summary.consensus) {
      lines.push(`- ${point.content}`);
      if (point.supporting_models?.length > 0) {
        lines.push(`  *Supporting: ${point.supporting_models.join(', ')}*`);
      }
    }
    lines.push('');
  }

  if (summary.disagreements?.length > 0) {
    lines.push('## Disagreements');
    for (const disagreement of summary.disagreements) {
      lines.push(`### ${disagreement.topic}`);
      lines.push(`*Type: ${disagreement.type}, Severity: ${disagreement.severity}*`);
      for (const position of disagreement.positions ?? []) {
        lines.push(`- **${position.model_id}** (${position.stance}): ${position.summary}`);
      }
    }
    lines.push('');
  }

  lines.push('## Recommendation');
  lines.push(summary.recommendation ?? '');
  lines.push('');

  lines.push(`**Confidence:** ${summary.confidence}`);
  lines.push('');

  if (summary.open_questions?.length > 0) {
    lines.push('## Open Questions');
    for (const q of summary.open_questions) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }

  if (summary.decision_boundary) {
    lines.push('## Decision Boundary');
    lines.push(summary.decision_boundary);
    lines.push('');
  }

  if (summary.disclaimer) {
    lines.push(`---`);
    lines.push(`*${summary.disclaimer}*`);
  }

  return lines.join('\n');
}

// ─── followup ─────────────────────────────────────────────────────────────────

function registerFollowupCommand(council: Command): void {
  council
    .command('followup <discussionId> <content>')
    .description('Follow up on a completed discussion')
    .option('--mode <mode>', 'Follow-up mode: ask_secretary | ask_model | new_council', 'ask_secretary')
    .option('--model <model>', 'Model ID (required for ask_model mode)')
    .action(
      async (
        discussionId: string,
        content: string,
        options: { mode?: string; model?: string }
      ) => {
        try {
          await ensureDatabaseReady({ label: 'council followup' });
          const config = loadAgoraModelConfig();
          const mode = (options.mode ?? 'ask_secretary') as
            | 'ask_secretary'
            | 'ask_model'
            | 'new_council';

          await handleFollowup(discussionId, content, {
            mode,
            modelId: options.model,
            config,
          });
        } catch (error) {
          processToolError('followup', error);
        } finally {
          await shutdownDbClient();
        }
      }
    );
}

async function handleFollowup(
  discussionId: string,
  content: string,
  options: {
    mode: 'ask_secretary' | 'ask_model' | 'new_council';
    modelId?: string;
    config: ReturnType<typeof loadAgoraModelConfig>;
  }
): Promise<void> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  // Load discussion
  const rows = await db
    .select({
      id: schema.conversations.id,
      userId: schema.conversations.userId,
      status: schema.conversations.status,
      topic: schema.conversations.topic,
      models: schema.conversations.models,
      summary: schema.conversations.summary,
      billingSnapshotId: schema.conversations.billingSnapshotId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, discussionId))
    .limit(1);

  const discussion = rows[0];
  if (!discussion) {
    throw new Error(`Discussion ${discussionId} not found`);
  }

  if (discussion.status !== 'completed') {
    throw new Error(
      `Discussion ${discussionId} is not completed (status: ${discussion.status}). Followup requires a completed discussion.`
    );
  }

  const summary = discussion.summary as DiscussionSummaryFinal | null;
  const client = createOpenRouterClient();

  console.log(`[followup] Discussion: ${discussionId}`);
  console.log(`[followup] Mode: ${options.mode}`);
  console.log(`[followup] Question: ${content}`);
  console.log('[followup] ---');

  switch (options.mode) {
    case 'ask_secretary':
      await handleFollowupAskSecretary({
        discussionId,
        content,
        summary,
        secretaryModel: options.config.secretaryModel,
        client,
      });
      break;

    case 'ask_model': {
      const modelId = options.modelId;
      if (!modelId) {
        throw new Error('--model is required for ask_model mode');
      }
      await handleFollowupAskModel({
        discussionId,
        content,
        summary,
        modelId,
        client,
      });
      break;
    }

    case 'new_council': {
      const models = resolveCouncilModels({
        config: options.config,
        requestedModels: undefined,
      });
      const billingSnapshotId =
        discussion.billingSnapshotId ??
        (await loadBillingSnapshotId(db, schema));

      await handleFollowupNewCouncil({
        content,
        parentId: discussionId,
        userId: discussion.userId,
        models,
        billingSnapshotId,
        config: options.config,
      });
      break;
    }
  }
}

async function handleFollowupAskSecretary(params: {
  discussionId: string;
  content: string;
  summary: DiscussionSummaryFinal | null;
  secretaryModel: string;
  client: ReturnType<typeof createOpenRouterClient>;
}): Promise<void> {
  const summaryContext = params.summary
    ? `Discussion Summary:\n${JSON.stringify(params.summary, null, 2)}`
    : '(No summary available)';

  const systemPrompt = `You are a secretary AI that previously summarized a council discussion. Based on that summary, answer the followup question concisely and accurately.\n\n${summaryContext}`;

  const indicator = createCliStatusIndicator();
  indicator.start(`[followup] ${params.secretaryModel} thinking...`);

  const stream = params.client.streamCompletion({
    model: params.secretaryModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: params.content },
    ],
  });

  let started = false;

  while (true) {
    const next = await stream.next();

    if (next.done) {
      if (indicator.isActive()) {
        indicator.succeed(`[followup] ${params.secretaryModel} done`);
      }
      process.stdout.write('\n');
      console.log(
        `[followup] Tokens: input=${next.value.usage.promptTokens} output=${next.value.usage.completionTokens}`
      );
      return;
    }

    if (!next.value.text) continue;

    if (!started) {
      indicator.succeed(`[followup] ${params.secretaryModel}:`);
      started = true;
    }

    process.stdout.write(next.value.text);
  }
}

async function handleFollowupAskModel(params: {
  discussionId: string;
  content: string;
  summary: DiscussionSummaryFinal | null;
  modelId: string;
  client: ReturnType<typeof createOpenRouterClient>;
}): Promise<void> {
  const summaryContext = params.summary
    ? `Council Discussion Summary:\n${JSON.stringify(params.summary, null, 2)}`
    : '(No summary available)';

  const systemPrompt = `You participated in a council discussion. Based on the summary, answer the followup question from your perspective.\n\n${summaryContext}`;

  const indicator = createCliStatusIndicator();
  indicator.start(`[followup] ${params.modelId} thinking...`);

  const stream = params.client.streamCompletion({
    model: params.modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: params.content },
    ],
  });

  let started = false;

  while (true) {
    const next = await stream.next();

    if (next.done) {
      if (indicator.isActive()) {
        indicator.succeed(`[followup] ${params.modelId} done`);
      }
      process.stdout.write('\n');
      console.log(
        `[followup] Tokens: input=${next.value.usage.promptTokens} output=${next.value.usage.completionTokens}`
      );
      return;
    }

    if (!next.value.text) continue;

    if (!started) {
      indicator.succeed(`[followup] ${params.modelId}:`);
      started = true;
    }

    process.stdout.write(next.value.text);
  }
}

async function handleFollowupNewCouncil(params: {
  content: string;
  parentId: string;
  userId: string;
  models: string[];
  billingSnapshotId: string;
  config: ReturnType<typeof loadAgoraModelConfig>;
}): Promise<void> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  const councilId = randomUUID();
  await db.insert(schema.conversations).values({
    id: councilId,
    userId: params.userId,
    type: 'council',
    mode: 'consensus',
    status: 'created',
    currentRound: 0,
    lastCompletedRound: 0,
    maxRounds: 3,
    models: params.models,
    title: params.content.slice(0, 80),
    topic: params.content,
    billingSnapshotId: params.billingSnapshotId,
    parentId: params.parentId,
    visibility: 'private',
  });

  console.log(`[followup] Created new council discussion: ${councilId}`);
  console.log(`[followup] Parent: ${params.parentId}`);
  console.log(`[followup] Models: ${params.models.join(', ')}`);

  const renderer = createCliEventRenderer({ getPanelModelIds: () => params.models });
  const logger = await createEventLogger({ discussionId: councilId });
  let logChain = Promise.resolve();
  const terminal = createTerminalLatch();

  const onEvent = (event: SSEEvent) => {
    renderer.render(event);
    logChain = logChain.then(() => logger.log(event)).catch(() => undefined);
    if (event.type === 'done' || event.type === 'error') {
      terminal.resolve(event);
    }
  };

  const { execution } = await startOrAttachDiscussion({
    actor: { userId: params.userId, source: 'cli' },
    discussionId: councilId,
    onEvent,
  });

  const terminalEvent = await terminal.promise;
  if (execution) await execution;
  await logChain;

  if (terminalEvent.type === 'error') {
    throw new Error(terminalEvent.data.message);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loadBillingSnapshotId(
  db: (typeof import('@/lib/db/index'))['db'],
  schema: typeof import('@/lib/db/schema')
): Promise<string> {
  const rows = await db
    .select({ id: schema.billingSnapshots.id })
    .from(schema.billingSnapshots)
    .orderBy(desc(schema.billingSnapshots.effectiveFrom))
    .limit(1);

  if (!rows[0]) {
    throw new Error('billing_snapshots is empty. Seed before running followup new_council.');
  }

  return rows[0].id;
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

function processToolError(tool: string, error: unknown): void {
  if (error instanceof DatabaseConnectionError) {
    console.error(`[${tool}] Database connection error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof ModelConfigError) {
    console.error(`[${tool}] Model configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${tool}] ${message}`);
  process.exitCode = 1;
}


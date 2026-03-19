/**
 * agora c / agora chat — 会话化单模型多轮对话
 *
 * 支持指令：
 * - /switch <model>  切换模型，保留上下文
 * - /upgrade         升级为议会讨论
 * - /exit            退出
 */

import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';

import type { Command } from 'commander';
import { desc, eq } from 'drizzle-orm';

import { createCliStatusIndicator } from '@/cli/display';
import {
  loadAgoraModelConfig,
  ModelConfigError,
  resolveAskModel,
  resolveCouncilModels,
} from '@/lib/config/models';
import {
  DatabaseConnectionError,
  ensureDatabaseReady,
  getDatabaseConnectionDiagnostics,
} from '@/lib/db/index';
import { validateTopicInput, RiskControlError } from '@/lib/security/risk-control';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import type { SSEEvent } from '@/lib/types';

import { upgradeToCouncil } from './council-upgrade';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat [prompt...]')
    .alias('c')
    .description('Start or resume chat')
    .option('-m, --model <model>', 'Model ID to use')
    .option('-c, --conversation-id <conversationId>', 'Resume an existing chat conversation')
    .addHelpText(
      'after',
      `
Examples:
  agora c
  agora c "Help me stress-test a product plan before I commit to it."
  agora c -m openai/gpt-oss-120b:free
  agora c -c <conversation-id>
  agora c -c <conversation-id> "Continue from the strongest objection."

Compatibility:
  agora chat
  agora chat "Help me stress-test a product plan before I commit to it."
  agora chat -m openai/gpt-oss-120b:free

Interactive commands:
  /switch <model-id>   switch models without losing context
  /upgrade             upgrade the current chat into a council discussion
  /exit                leave the chat session
`
    )
    .action(async (promptParts: string[], options: { model?: string; conversationId?: string }) => {
      try {
        await handleChat({
          ...options,
          initialPrompt: resolveInitialChatPrompt(promptParts),
        });
      } catch (error) {
        processChatError(error);
      }
    });
}

async function handleChat(options: {
  model?: string;
  conversationId?: string;
  initialPrompt?: string | null;
}): Promise<void> {
  const startupIndicator = createCliStatusIndicator();

  try {
    startupIndicator.start('[chat] Initializing database');
    await ensureDatabaseReady({ label: 'chat startup' });
    startupIndicator.succeed('[chat] Ready');
  } catch (error) {
    startupIndicator.fail('[chat] Startup failed');
    throw error;
  }

  const config = loadAgoraModelConfig();
  const dbDiag = getDatabaseConnectionDiagnostics();

  let currentModel = resolveAskModel({ config, requestedModel: options.model });
  const history: ChatMessage[] = [];
  const client = createOpenRouterClient();

  let conversationId = options.conversationId ?? null;

  // Load existing conversation if provided
  if (conversationId) {
    const loaded = await loadExistingChatMessages(conversationId);
    history.push(...loaded);
    console.log(`[chat] Resumed conversation ${conversationId} (${history.length} messages)`);
  }

  console.log(`[chat] Model: ${currentModel}`);
  console.log(`[chat] DB: ${dbDiag.active.source} (${dbDiag.active.label})`);
  console.log('[chat] Commands: /switch <model> | /upgrade | /exit');
  console.log('[chat] ---');

  if (options.initialPrompt) {
    console.log(`[chat] You: ${options.initialPrompt}`);
    const shouldContinue = await processChatInput({
      input: options.initialPrompt,
      currentModel,
      history,
      conversationId,
      client,
      onModelChange: (nextModel) => {
        currentModel = nextModel;
      },
      onConversationIdChange: (nextConversationId) => {
        conversationId = nextConversationId;
      },
      onUpgrade: async (nextConversationId) => {
        console.log(`[chat] Upgrading conversation ${nextConversationId} to council...`);
        await handleChatUpgrade({ conversationId: nextConversationId, config });
      },
    });

    if (!shouldContinue) {
      await shutdownDbClient();
      return;
    }
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const rawInput = await readline.question('[chat] You: ');
      const input = rawInput.trim();

      if (!input) continue;
      const shouldContinue = await processChatInput({
        input,
        currentModel,
        history,
        conversationId,
        client,
        onModelChange: (nextModel) => {
          currentModel = nextModel;
        },
        onConversationIdChange: (nextConversationId) => {
          conversationId = nextConversationId;
        },
        onUpgrade: async (nextConversationId) => {
          readline.close();
          console.log(`[chat] Upgrading conversation ${nextConversationId} to council...`);
          await handleChatUpgrade({ conversationId: nextConversationId, config });
        },
      });

      if (!shouldContinue) {
        return;
      }
    }
  } finally {
    readline.close();
    await shutdownDbClient();
  }
}

async function processChatInput(params: {
  input: string;
  currentModel: string;
  history: ChatMessage[];
  conversationId: string | null;
  client: ReturnType<typeof createOpenRouterClient>;
  onModelChange: (model: string) => void;
  onConversationIdChange: (conversationId: string) => void;
  onUpgrade: (conversationId: string) => Promise<void>;
}): Promise<boolean> {
  if (params.input === '/exit') {
    console.log('[chat] Goodbye.');
    return false;
  }

  if (params.input.startsWith('/switch ')) {
    const newModel = params.input.slice('/switch '.length).trim();
    if (!newModel) {
      console.log('[chat] Usage: /switch <model-id>');
      return true;
    }
    params.onModelChange(newModel);
    console.log(`[chat] Switched to model: ${newModel}`);
    return true;
  }

  if (params.input === '/upgrade') {
    let nextConversationId = params.conversationId;

    if (!nextConversationId) {
      if (params.history.length === 0) {
        console.log('[chat] No messages to upgrade. Start chatting first.');
        return true;
      }

      nextConversationId = await flushChatToDb({
        currentModel: params.currentModel,
        history: params.history,
      });
      params.onConversationIdChange(nextConversationId);
      console.log(`[chat] Saved conversation ${nextConversationId}`);
    }

    await params.onUpgrade(nextConversationId);
    return false;
  }

  try {
    validateTopicInput({ topic: params.input, mode: 'chat' });
  } catch (err) {
    if (err instanceof RiskControlError) {
      console.log(`[chat] Input rejected (${err.code}): ${err.message}`);
      return true;
    }
    throw err;
  }

  let nextConversationId = params.conversationId;
  if (!nextConversationId && params.history.length === 0) {
    nextConversationId = await createChatConversation(params.currentModel);
    params.onConversationIdChange(nextConversationId);
    console.log(`[chat] Conversation ID: ${nextConversationId}`);
  }

  params.history.push({ role: 'user', content: params.input });
  if (nextConversationId) {
    await persistMessage(nextConversationId, {
      role: 'user',
      content: params.input,
      modelId: null,
    });
  }

  const responseIndicator = createCliStatusIndicator();
  let responseText = '';
  let started = false;

  responseIndicator.start(`[chat] ${params.currentModel} thinking...`);

  try {
    const stream = params.client.streamCompletion({
      model: params.currentModel,
      messages: params.history.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    while (true) {
      const next = await stream.next();

      if (next.done) {
        if (responseIndicator.isActive()) {
          responseIndicator.succeed(`[chat] ${params.currentModel} done`);
        }

        process.stdout.write('\n');
        console.log(
          `[chat] Tokens: input=${next.value.usage.promptTokens} output=${next.value.usage.completionTokens}`
        );

        params.history.push({ role: 'assistant', content: responseText });
        if (nextConversationId) {
          await persistMessage(nextConversationId, {
            role: 'assistant',
            content: responseText,
            modelId: params.currentModel,
          });
        }
        break;
      }

      if (!next.value.text) continue;

      if (!started) {
        responseIndicator.succeed(`[chat] ${params.currentModel}:`);
        started = true;
      }

      process.stdout.write(next.value.text);
      responseText += next.value.text;
    }
  } catch (error) {
    if (responseIndicator.isActive()) {
      responseIndicator.fail(`[chat] ${params.currentModel} failed`);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chat] Error: ${message}`);
    params.history.pop();
    if (nextConversationId) {
      await deleteLastUserMessage(nextConversationId);
    }
  }

  return true;
}

function resolveInitialChatPrompt(promptParts: string[]): string | null {
  const prompt = promptParts.join(' ').trim();
  return prompt.length > 0 ? prompt : null;
}

async function handleChatUpgrade(params: {
  conversationId: string;
  config: ReturnType<typeof loadAgoraModelConfig>;
}): Promise<void> {
  const models = resolveCouncilModels({ config: params.config, requestedModels: undefined });
  await upgradeToCouncil({
    chatConversationId: params.conversationId,
    models,
    onEvent: createDefaultEventPrinter(),
  });
}

function createDefaultEventPrinter(): (event: SSEEvent) => void {
  return (event) => {
    if (event.type === 'progress') {
      console.log(`[upgrade] Round ${event.data.round} — ${event.data.phase}`);
    } else if (event.type === 'summary') {
      console.log('[upgrade] Summary:');
      console.log(JSON.stringify(event.data, null, 2));
    } else if (event.type === 'done') {
      console.log(
        `[upgrade] Done. Raw cost: ${event.data.total_raw_cost}, Platform price: ${event.data.total_platform_price}`
      );
    } else if (event.type === 'error') {
      console.error(`[upgrade] Error (${event.data.code}): ${event.data.message}`);
    }
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function createChatConversation(model: string): Promise<string> {
  const cliUserId = process.env.CLI_TEST_USER_ID?.trim();
  if (!cliUserId) throw new Error('CLI_TEST_USER_ID is required');

  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const conversationId = randomUUID();

  await db.insert(schema.conversations).values({
    id: conversationId,
    userId: cliUserId,
    type: 'chat',
    mode: 'consensus',
    status: 'streaming',
    currentRound: 0,
    lastCompletedRound: 0,
    models: [model],
    title: 'Chat session',
    topic: null,
    visibility: 'private',
  });

  return conversationId;
}

async function persistMessage(
  conversationId: string,
  params: { role: 'user' | 'assistant'; content: string; modelId: string | null }
): Promise<void> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  await db.insert(schema.messages).values({
    conversationId,
    role: params.role,
    logicalModelId: params.modelId,
    actualModelId: params.modelId,
    content: params.content,
    status: 'completed',
  });
}

async function deleteLastUserMessage(conversationId: string): Promise<void> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  const rows = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(1);

  const last = rows[0];
  if (last) {
    await db.delete(schema.messages).where(eq(schema.messages.id, last.id));
  }
}

async function loadExistingChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);

  const rows = await db
    .select({
      role: schema.messages.role,
      content: schema.messages.content,
    })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt);

  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));
}

async function flushChatToDb(params: {
  currentModel: string;
  history: ChatMessage[];
}): Promise<string> {
  const cliUserId = process.env.CLI_TEST_USER_ID?.trim();
  if (!cliUserId) throw new Error('CLI_TEST_USER_ID is required');

  const [{ db }, schema] = await Promise.all([import('@/lib/db/index'), import('@/lib/db/schema')]);
  const conversationId = randomUUID();

  await db.insert(schema.conversations).values({
    id: conversationId,
    userId: cliUserId,
    type: 'chat',
    mode: 'consensus',
    status: 'streaming',
    currentRound: 0,
    lastCompletedRound: 0,
    models: [params.currentModel],
    title: 'Chat session',
    topic: null,
    visibility: 'private',
  });

  for (const msg of params.history) {
    await db.insert(schema.messages).values({
      conversationId,
      role: msg.role,
      logicalModelId: msg.role === 'assistant' ? params.currentModel : null,
      actualModelId: msg.role === 'assistant' ? params.currentModel : null,
      content: msg.content,
      status: 'completed',
    });
  }

  return conversationId;
}

async function shutdownDbClient(): Promise<void> {
  try {
    const { dbClient } = await import('@/lib/db/index');
    await dbClient.end({ timeout: 0 });
  } catch {
    // Ignore
  }
}

function processChatError(error: unknown): void {
  if (error instanceof DatabaseConnectionError) {
    console.error(`[chat] Database connection error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof ModelConfigError) {
    console.error(`[chat] Model configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[chat] ${message}`);
  process.exitCode = 1;
}

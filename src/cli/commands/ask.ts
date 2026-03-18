import type { Command } from 'commander';

import { createCliStatusIndicator } from '@/cli/display';
import { loadGroundingConfig, shouldUseGrounding } from '@/lib/config/grounding';
import {
  buildAskGroundingMessages,
  createGroundingContextResult,
  formatGroundingSourcesForCli,
  type GroundingContextResult,
  prepareGroundingContext,
} from '@/lib/grounding/service';
import { createOpenRouterClient } from '@/lib/openrouter/client';
import { loadAgoraModelConfig, ModelConfigError, resolveAskModel } from '@/lib/config/models';
import { RiskControlError, validateTopicInput } from '@/lib/security/risk-control';

export function registerAskCommand(program: Command): void {
  program
    .command('ask')
    .description('Ask a single model question')
    .requiredOption('-q, --question <question>', 'Question to ask')
    .option('-m, --model <model>', 'Model ID to use')
    .action(async (options: { question: string; model?: string }) => {
      try {
        await handleAsk(options);
      } catch (error) {
        processAskError(error);
      }
    });
}

async function handleAsk(options: { question: string; model?: string }): Promise<void> {
  const config = loadAgoraModelConfig();
  const model = resolveAskModel({
    config,
    requestedModel: options.model,
  });

  validateTopicInput({
    topic: options.question,
    mode: 'chat',
  });

  const client = createOpenRouterClient();
  const groundingIndicator = createCliStatusIndicator();
  const groundingConfig = loadGroundingConfig();
  const shouldGround = shouldUseGrounding({
    topic: options.question.trim(),
    scenario: 'ask',
    config: groundingConfig,
  });

  let grounding: GroundingContextResult = createGroundingContextResult();

  if (shouldGround) {
    groundingIndicator.start('[ask] Researching the web for current context', {
      milestones: [
        {
          afterMs: 3_000,
          message: '[ask] Still collecting web background',
        },
        {
          afterMs: 8_000,
          message: '[ask] Web research is taking longer than usual',
        },
      ],
    });

    grounding = await prepareGroundingContext({
      topic: options.question.trim(),
      scenario: 'ask',
      defaultModel: model,
      client,
    });

    if (grounding.used) {
      groundingIndicator.succeed(
        `[ask] Web grounding ready (${grounding.sources.length} sources via ${grounding.provider})`
      );
      console.log(`[ask] Grounding provider: ${grounding.provider}`);
      console.log(`[ask] Grounding summary model: ${grounding.summaryModel}`);
      for (const line of formatGroundingSourcesForCli(grounding)) {
        console.log(line);
      }
    } else if (groundingIndicator.isActive()) {
      groundingIndicator.fail('[ask] Web grounding unavailable, continuing without it');
      if (grounding.errorMessage) {
        console.log(`[ask] Grounding warning: ${grounding.errorMessage}`);
      }
    }
  }

  const stream = client.streamCompletion({
    model,
    messages: buildAskGroundingMessages({
      question: options.question,
      grounding,
    }),
  });
  const indicator = createCliStatusIndicator();
  let responseStarted = false;

  console.log(`[ask] Model source: ${config.source}`);
  console.log(`[ask] Model: ${model}`);
  indicator.start(`[ask] Sending request to ${model}`, {
    milestones: [
      {
        afterMs: 3_000,
        message: `[ask] ${model} is thinking`,
      },
      {
        afterMs: 8_000,
        message: `[ask] ${model} is still thinking, waiting for first token`,
      },
      {
        afterMs: 15_000,
        message: `[ask] ${model} is taking longer than usual, you can Ctrl+C to abort`,
      },
    ],
  });

  try {
    while (true) {
      const next = await stream.next();

      if (next.done) {
        if (indicator.isActive()) {
          indicator.succeed(`[ask] Response completed from ${model}`);
        }

        if (!responseStarted) {
          console.log('[ask] Response:');
        } else {
          process.stdout.write('\n');
        }

        console.log(
          `[ask] Tokens: input=${next.value.usage.promptTokens} output=${next.value.usage.completionTokens}`
        );
        return;
      }

      if (!next.value.text) {
        continue;
      }

      if (!responseStarted) {
        indicator.succeed(`[ask] First token received from ${model}`);
        console.log('[ask] Response:');
        responseStarted = true;
      }

      process.stdout.write(next.value.text);
    }
  } catch (error) {
    if (indicator.isActive()) {
      indicator.fail(`[ask] Request failed for ${model}`);
    }

    throw error;
  }
}

function processAskError(error: unknown): void {
  if (error instanceof ModelConfigError) {
    console.error(`[ask] Model configuration error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (error instanceof RiskControlError) {
    console.error(`[ask] Risk control error (${error.code}): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ask] ${message}`);
  process.exitCode = 1;
}

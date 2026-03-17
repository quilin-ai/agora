import type { Command } from 'commander';

import { loadAgoraModelConfig, ModelConfigError, resolveAskModel } from '@/lib/config/models';

/**
 * ask 占位命令
 *
 * 当前只提供命令骨架，真实模型调用会在后续 Task 中接入。
 */
export function registerAskCommand(program: Command): void {
  program
    .command('ask')
    .description('Ask a single model question (not yet implemented)')
    .requiredOption('-q, --question <question>', 'Question to ask')
    .option('-m, --model <model>', 'Model ID to use')
    .action((options: { question: string; model?: string }) => {
      try {
        const config = loadAgoraModelConfig();
        const model = resolveAskModel({
          config,
          requestedModel: options.model,
        });

        console.log(`[ask] Model source: ${config.source}`);
        console.log(`[ask] Allowed models: ${config.allowedModels.join(', ')}`);
        console.log(`[ask] Secretary model: ${config.secretaryModel}`);
        console.log(`[ask] Question: ${options.question}`);
        console.log(`[ask] Model: ${model}`);
        console.log('[ask] Not implemented yet. Waiting for a later task.');
      } catch (error) {
        if (error instanceof ModelConfigError) {
          console.error(`[ask] Model configuration error: ${error.message}`);
          process.exitCode = 1;
          return;
        }

        throw error;
      }
    });
}

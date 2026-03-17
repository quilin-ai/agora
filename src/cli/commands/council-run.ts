import type { Command } from 'commander';

import {
  loadAgoraModelConfig,
  ModelConfigError,
  resolveCouncilModels,
} from '@/lib/config/models';

/**
 * council-run 占位命令
 *
 * 当前只注册命令结构，不接真实 orchestrator。
 * Task-008 会接入真实编排流程。
 */
export function registerCouncilCommands(program: Command): void {
  const council = program
    .command('council')
    .description('Council discussion commands');

  council
    .command('run')
    .description('Run a council discussion (not yet implemented)')
    .requiredOption('-t, --topic <topic>', 'Discussion topic')
    .option('-m, --models <models...>', 'Model IDs to participate')
    .action((options: { topic: string; models?: string[] }) => {
      try {
        const config = loadAgoraModelConfig();
        const models = resolveCouncilModels({
          config,
          requestedModels: options.models,
        });

        console.log(`[council run] Model source: ${config.source}`);
        console.log(`[council run] Allowed models: ${config.allowedModels.join(', ')}`);
        console.log(`[council run] Secretary model: ${config.secretaryModel}`);
        console.log(`[council run] Topic: ${options.topic}`);
        console.log(`[council run] Models: ${models.join(', ')}`);
        console.log('[council run] Not implemented yet. Waiting for Task-008.');
      } catch (error) {
        if (error instanceof ModelConfigError) {
          console.error(`[council run] Model configuration error: ${error.message}`);
          process.exitCode = 1;
          return;
        }

        throw error;
      }
    });
}

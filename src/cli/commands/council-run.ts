import type { Command } from 'commander';

/**
 * council-run 占位命令
 *
 * 当前只注册命令结构，不接真实 orchestrator。
 * Task-008 会接入真实编排流程。
 */
export function registerCouncilRunCommand(program: Command): void {
  program
    .command('council-run')
    .description('Run a council discussion (not yet implemented)')
    .requiredOption('-t, --topic <topic>', 'Discussion topic')
    .option('-m, --models <models...>', 'Model IDs to participate')
    .action((options: { topic: string; models?: string[] }) => {
      console.log(`[council-run] Topic: ${options.topic}`);
      console.log(`[council-run] Models: ${options.models?.join(', ') ?? 'default'}`);
      console.log('[council-run] Not implemented yet. Waiting for Task-008.');
    });
}

import type { Command } from 'commander';

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
      console.log(`[ask] Question: ${options.question}`);
      console.log(`[ask] Model: ${options.model ?? 'default'}`);
      console.log('[ask] Not implemented yet. Waiting for a later task.');
    });
}

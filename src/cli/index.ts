#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'node:url';

import { registerAskCommand } from './commands/ask';
import { registerCouncilCommands } from './commands/council-run';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('agora')
    .description('Agora MVP — CLI-first council discussion engine')
    .version('0.1.0');

  registerAskCommand(program);
  registerCouncilCommands(program);

  return program;
}

function isCliEntrypoint(): boolean {
  const entryArg = process.argv[1];

  if (!entryArg) {
    return false;
  }

  return fileURLToPath(import.meta.url) === entryArg;
}

if (isCliEntrypoint()) {
  const program = createProgram();
  program.parse();
}

#!/usr/bin/env node

import { Command } from 'commander';

import { registerCouncilRunCommand } from './commands/council-run';

const program = new Command();

program
  .name('agora')
  .description('Agora MVP — CLI-first council discussion engine')
  .version('0.1.0');

registerCouncilRunCommand(program);

program.parse();

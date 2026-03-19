#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'node:url';

import { registerAskCommand } from '@/cli/commands/ask';
import { registerChatCommand } from '@/cli/commands/chat';
import { registerCouncilCommands } from '@/cli/commands/council-run';
import { renderCliWelcome } from '@/cli/display';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('agora')
    .description('CLI-first council engine for multi-model reasoning')
    .version('0.1.0')
    .showHelpAfterError('(run `agora --help` for usage)')
    .addHelpText(
      'after',
      `
Examples:
  agora t "Should a small AI startup win with a CLI first?"
  agora a "Will AI coding agents replace most junior developer work?"
  agora c "Help me stress-test a product plan before I commit to it."
  agora council replay --last
  agora council export <discussion-id> --format markdown

Compatibility:
  agora council run "..." same as: agora t "..."
  agora ask "..."        same as: agora a "..."
  agora chat             same as: agora c

Quick reference:
  council run|t
    Usage:
      agora t "Should a small AI startup win with a CLI first?"
      agora t -d <discussion-id>
    Main options:
      -t, --topic <topic>                 topic text; optional if passed positionally
      -m, --models <models...>            choose participant models
      -d, --discussion-id <discussionId>  attach to an existing discussion

  ask|a
    Usage:
      agora a "Is now a good time to launch a finance AI copilot?"
      agora ask -q "What changed in AI infra this week?" -m <model>
    Main options:
      -q, --question <question>   question text; optional if passed positionally
      -m, --model <model>         choose a specific model

  chat|c
    Usage:
      agora c
      agora c "Help me stress-test a product plan before I commit to it."
      agora c -m <model>
      agora c -c <conversation-id>
    Main options:
      -m, --model <model>                     choose a specific model
      -c, --conversation-id <conversationId> resume an existing chat

Council subcommands:
  run        compatibility entrypoint for agora t
  upgrade    turn a chat conversation into a council discussion
  replay     replay saved discussion event logs
  export     export a completed discussion summary
  followup   ask follow-up questions after a discussion completes
`
    );

  registerCouncilCommands(program);
  registerAskCommand(program);
  registerChatCommand(program);

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
  const hasUserArgs = process.argv.slice(2).length > 0;

  if (!hasUserArgs) {
    if (process.stdout.isTTY) {
      renderCliWelcome(program.version());
      process.exitCode = 0;
    } else {
      program.outputHelp();
      process.exitCode = 0;
    }
  } else {
    void program.parseAsync().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
  }
}

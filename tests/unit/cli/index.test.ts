import { describe, expect, it } from 'vitest';

import { createProgram } from '@/cli/index';

describe('CLI skeleton', () => {
  it('registers the root command metadata', () => {
    const program = createProgram();

    expect(program.name()).toBe('agora');
    expect(program.description()).toContain('CLI-first');
  });

  it('registers primary command entrypoints and council tools', () => {
    const program = createProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain('ask');
    expect(commandNames).toContain('chat');
    expect(commandNames).toContain('t');
    expect(commandNames).toContain('council');
  });

  it('registers council run as a nested subcommand', () => {
    const program = createProgram();
    const council = program.commands.find((command) => command.name() === 'council');

    expect(council).toBeDefined();
    expect(council?.commands.map((command) => command.name())).toContain('run');
  });
});

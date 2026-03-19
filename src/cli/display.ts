import chalk from 'chalk';

import type { DiscussionSummaryFinal, SSEEvent } from '@/lib/types';

export interface CliEventRenderer {
  render(event: SSEEvent): void;
}

interface CliWriteStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
  columns?: number;
}

interface CliEventRendererOptions {
  stdout?: CliWriteStream;
  stderr?: CliWriteStream;
  now?: () => number;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  getPanelModelIds?: () => string[];
  panelHeight?: number;
}

export interface CliStatusMilestone {
  afterMs: number;
  message: string;
}

export interface CliStatusIndicator {
  start(message: string, options?: { milestones?: CliStatusMilestone[] }): void;
  update(message: string): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  isActive(): boolean;
}

interface CliStatusIndicatorOptions {
  stream?: CliWriteStream;
  now?: () => number;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

const SPINNER_FRAMES = ['-', '\\', '|', '/'] as const;
const PHASE_LABELS: Record<string, string> = {
  background_research: 'web grounding',
  starting: 'starting discussion',
  independent: 'independent analysis',
  anonymous_review: 'anonymous cross-review',
  review: 'cross-review',
  round_summary: 'inter-round secretary summary',
  secretary_summary: 'secretary summary',
  rebuttal: 'final rebuttal',
  summary: 'secretary summary',
  summarizing: 'secretary summary',
};
const AGORA_LOGO_ROWS = [
  ' █████╗  ███████╗   █████╗  ██████╗   █████╗',
  '██╔══██╗ ██╔════╝  ██╔══██╗ ██╔══██╗ ██╔══██╗',
  '███████║ ██║  ███╗ ██║  ██║ ██████╔╝ ███████║',
  '██╔══██║ ██║   ██║ ██║  ██║ ██╔══██╗ ██╔══██║',
  '██║  ██║ ╚██████╔╝ ╚█████╔╝ ██║  ██║ ██║  ██║',
  '╚═╝  ╚═╝  ╚═════╝   ╚════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝',
] as const;
const AGORA_LOGO_COLORS = ['#59B7FF', '#7B8CFF', '#A879FF', '#C77FEA', '#D97DCE'] as const;

function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

export function formatCliElapsedMs(durationMs: number): string {
  return formatElapsedSeconds(durationMs / 1000);
}

export function formatCliPhaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase.replaceAll('_', ' ');
}

export function renderCliWelcome(version = '0.1.0', stdout: CliWriteStream = process.stdout): void {
  const writeLine = (line = ''): void => {
    stdout.write(`${line}\n`);
  };

  if (stdout.isTTY) {
    stdout.write('\x1b[2J\x1b[H');
  }

  const logo = renderAgoraLogo();
  const featuredWorkflows = [
    [
      'Product strategy',
      'Should a small AI startup win with a CLI first, or launch a polished web app first?',
      'agora t "Should a small AI startup win with a CLI first, or launch a polished web app first?"',
    ],
    [
      'Fast take',
      'Will AI coding agents replace most junior developer work in the next three years?',
      'agora a "Will AI coding agents replace most junior developer work in the next three years?"',
    ],
    [
      'Deep dive',
      'Help me stress-test a product plan before I commit to it.',
      'agora c "Help me stress-test a product plan before I commit to it."',
    ],
  ] as const;
  const secondaryWorkflows = [
    [
      'Pricing debate',
      'agora t "Is monthly subscription pricing better than usage-based pricing for a new AI product?"',
    ],
    [
      'Market timing',
      'agora a "Is now the right time to launch a finance AI copilot?"',
    ],
    ['Resume a chat', 'agora c -c <conversation-id>'],
  ] as const;
  const divider = renderWelcomeDivider(stdout.columns ?? 100);

  writeLine(logo);
  writeLine();
  writeLine(
    `${chalk.bold.white('Agora')} ${formatWelcomeBadge(`v${version}`)} ${chalk.dim('CLI-first council engine')}`
  );
  writeLine(chalk.dim('Debate before you decide.'));
  writeLine(chalk.dim('Use councils for hard calls, tradeoffs, disagreement, and time-sensitive judgment.'));
  writeLine(divider);
  writeLine();
  writeLine(formatSectionHeader('START WITH THESE'));
  writeLine();
  for (const [index, [label, description, command]] of featuredWorkflows.entries()) {
    writeLine(formatFeaturedWorkflow(index + 1, label, description, command));
    writeLine();
  }
  writeLine(divider);
  writeLine();
  writeLine(formatSectionHeader('EXPLORE MORE'));
  for (const [label, command] of secondaryWorkflows) {
    writeLine(formatMiniWorkflow(label, command));
  }
  writeLine();
  writeLine(`${chalk.dim('Need the full command surface?')} ${formatInlineCommand('agora --help')}`);
}

export function createCliStatusIndicator(
  options: CliStatusIndicatorOptions = {}
): CliStatusIndicator {
  const stream = options.stream ?? process.stderr;
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? 120;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  let message = '';
  let frameIndex = 0;
  let startedAt: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let milestones: CliStatusMilestone[] = [];
  let nextMilestoneIndex = 0;

  function clearLine(): void {
    if (!stream.isTTY) {
      return;
    }

    stream.write('\r\x1b[2K');
  }

  function formatElapsed(): string {
    return `${((now() - (startedAt ?? now())) / 1000).toFixed(1)}s`;
  }

  function writeWaitLine(): void {
    stream.write(`${chalk.cyan('[wait]')} ${message} ${chalk.gray(`(${formatElapsed()})`)}\n`);
  }

  function renderFrame(): void {
    if (startedAt === null || !stream.isTTY) {
      return;
    }

    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    frameIndex += 1;
    clearLine();
    stream.write(
      `${chalk.cyan('[wait]')} ${message} ${chalk.cyan(frame)} ${chalk.gray(`(${formatElapsed()})`)}`
    );
  }

  function applyMilestones(): boolean {
    if (startedAt === null || nextMilestoneIndex >= milestones.length) {
      return false;
    }

    const elapsedMs = now() - startedAt;
    let changed = false;

    while (nextMilestoneIndex < milestones.length && elapsedMs >= milestones[nextMilestoneIndex].afterMs) {
      message = milestones[nextMilestoneIndex].message;
      nextMilestoneIndex += 1;
      changed = true;
    }

    return changed;
  }

  function tick(): void {
    const messageChanged = applyMilestones();

    if (stream.isTTY) {
      renderFrame();
      return;
    }

    if (messageChanged) {
      writeWaitLine();
    }
  }

  function disposeTimer(): void {
    if (!timer) {
      return;
    }

    clearIntervalFn(timer);
    timer = null;
  }

  function finish(status: 'ready' | 'error', nextMessage?: string): void {
    if (startedAt === null) {
      return;
    }

    const finalMessage = nextMessage ?? message;
    const prefix = status === 'ready' ? chalk.green('[ready]') : chalk.red('[error]');
    disposeTimer();
    clearLine();
    stream.write(`${prefix} ${finalMessage} ${chalk.gray(`(${formatElapsed()})`)}\n`);
    message = '';
    frameIndex = 0;
    startedAt = null;
  }

  return {
    start(nextMessage, options) {
      if (startedAt !== null) {
        this.stop();
      }

      message = nextMessage;
      frameIndex = 0;
      startedAt = now();
      milestones = [...(options?.milestones ?? [])].sort((left, right) => left.afterMs - right.afterMs);
      nextMilestoneIndex = 0;

      if (!stream.isTTY) {
        writeWaitLine();
      } else {
        renderFrame();
      }

      if (stream.isTTY || milestones.length > 0) {
        timer = setIntervalFn(tick, intervalMs);
      }
    },
    update(nextMessage) {
      if (startedAt === null) {
        return;
      }

      message = nextMessage;

      if (stream.isTTY) {
        renderFrame();
        return;
      }

      writeWaitLine();
    },
    stop() {
      if (startedAt === null) {
        return;
      }

      disposeTimer();
      clearLine();
      message = '';
      frameIndex = 0;
      startedAt = null;
      milestones = [];
      nextMilestoneIndex = 0;
    },
    succeed(nextMessage) {
      finish('ready', nextMessage);
    },
    fail(nextMessage) {
      finish('error', nextMessage);
    },
    isActive() {
      return startedAt !== null;
    },
  };
}

function renderAgoraLogo(): string {
  const visibleColumns = getVisibleColumns(AGORA_LOGO_ROWS);
  const visibleColumnIndex = new Map(visibleColumns.map((column, index) => [column, index]));
  const span = Math.max(1, visibleColumns.length - 1);

  return AGORA_LOGO_ROWS.map((row) => {
    let rendered = '';

    for (let index = 0; index < row.length; index += 1) {
      const char = row[index];

      if (char === ' ') {
        rendered += char;
        continue;
      }

      const visibleIndex = visibleColumnIndex.get(index) ?? 0;
      const color = getInterpolatedThemeColor(AGORA_LOGO_COLORS, visibleIndex / span);
      rendered += chalk.rgb(color.r, color.g, color.b)(char);
    }

    return rendered;
  }).join('\n');
}

function renderWelcomeDivider(columns: number): string {
  return chalk.hex('#3B4170')('─'.repeat(Math.max(36, Math.min(columns - 2, 72))));
}

function formatWelcomeBadge(text: string): string {
  return chalk.bgHex('#2F355E').hex('#D7DDFF')(` ${text} `);
}

function formatSectionHeader(text: string): string {
  return chalk.bgHex('#1F2440').hex('#C7D2FF')(` ${text} `);
}

function formatStepBadge(step: number): string {
  return chalk.bgHex('#222A4A').hex('#7B8CFF')(` ${String(step).padStart(2, '0')} `);
}

function formatCommandLine(command: string): string {
  const parts = command.match(/"[^"]*"|\S+/g) ?? [command];
  const rendered = parts.map((part, index) => {
    if (index === 0) {
      return chalk.bold.white(part);
    }

    if (part.startsWith('-')) {
      return chalk.hex('#A879FF')(part);
    }

    if (part.startsWith('"') && part.endsWith('"')) {
      return chalk.hex('#7FD7C9')(part);
    }

    if (part.startsWith('<') && part.endsWith('>')) {
      return chalk.hex('#D97DCE')(part);
    }

    return chalk.hex('#67D9FF')(part);
  });

  return `${chalk.dim('$')} ${rendered.join(' ')}`;
}

function formatInlineCommand(command: string): string {
  return chalk.whiteBright(command);
}

function formatFeaturedWorkflow(
  step: number,
  label: string,
  description: string,
  command: string
): string {
  const rail = chalk.hex('#3F4C86')('│');
  return [
    `${formatStepBadge(step)} ${chalk.bold.white(label)}`,
    `   ${rail} ${chalk.dim(description)}`,
    `   ${rail} ${formatCommandLine(command)}`,
  ].join('\n');
}

function formatMiniWorkflow(label: string, command: string): string {
  return `${chalk.hex('#67D9FF')('•')} ${chalk.white(label)}  ${chalk.dim('·')}  ${formatCommandLine(command)}`;
}

function getVisibleColumns(rows: readonly string[]): number[] {
  const columns = new Set<number>();

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (row[index] !== ' ') {
        columns.add(index);
      }
    }
  }

  return [...columns].sort((left, right) => left - right);
}

function getInterpolatedThemeColor(
  colors: readonly string[],
  position: number
): { r: number; g: number; b: number } {
  const palette = colors.map((color) => parseHexColor(color));
  const segmentCount = palette.length - 1;
  const scaled = Math.max(0, Math.min(1, position)) * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const factor = scaled - index;

  return interpolateRgb(palette[index], palette[index + 1], factor);
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function interpolateRgb(
  start: { r: number; g: number; b: number },
  end: { r: number; g: number; b: number },
  factor: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(start.r + (end.r - start.r) * factor),
    g: Math.round(start.g + (end.g - start.g) * factor),
    b: Math.round(start.b + (end.b - start.b) * factor),
  };
}

export function createCliEventRenderer(options: CliEventRendererOptions = {}): CliEventRenderer {
  return createCliEventRendererWithOptions(options);
}

export function createCliEventRendererWithOptions(
  options: CliEventRendererOptions = {}
): CliEventRenderer {
  const stdout = options.stdout ?? process.stdout;
  const now = options.now ?? Date.now;
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const panelHeight = options.panelHeight ?? 6;
  const streamBuffers = new Map<string, string>();
  const roundStartedAt = new Map<number, number>();
  const roundOutputs = new Map<number, Map<string, string>>();
  const usePanels = Boolean(stdout.isTTY);
  const panelState = createPanelState({
    stdout,
    now,
    panelHeight,
    getModelIds: options.getPanelModelIds,
  });

  function setRoundOutput(round: number, modelId: string, text: string): void {
    const existing = roundOutputs.get(round) ?? new Map<string, string>();
    existing.set(modelId, text);
    roundOutputs.set(round, existing);
  }

  function consumeStreamBuffer(key: string): string {
    const text = streamBuffers.get(key) ?? '';
    streamBuffers.delete(key);
    return text;
  }

  function flushModelTranscript(params: {
    round: number;
    modelId: string;
    text: string;
    partial?: boolean;
  }): void {
    if (!params.text.trim()) {
      return;
    }

    const prefix = params.partial ? 'partial' : 'round';
    stdout.write(
      chalk.blueBright(`\n[${prefix} ${params.round}] ${params.modelId}\n`)
    );
    stdout.write(params.text.trimEnd());
    stdout.write('\n');
  }

  function renderRoundRecap(round: number): void {
    const outputs = roundOutputs.get(round);

    if (!outputs || outputs.size === 0) {
      return;
    }

    log(chalk.whiteBright(`[round_recap] r${round}`));
    for (const [modelId, text] of outputs.entries()) {
      log(chalk.white(`- ${modelId}: ${extractPreview(text)}`));
    }
  }

  function renderSummaryBlock(label: string, summary: DiscussionSummaryFinal): void {
    log(chalk.greenBright(`\n[${label}]`));
    log(chalk.white(`recommendation: ${summary.recommendation}`));
    log(chalk.white(`confidence: ${summary.confidence}`));

    if (summary.consensus.length > 0) {
      log(chalk.white(`consensus: ${summary.consensus.length}`));
    }

    if (summary.disagreements.length > 0) {
      log(chalk.white(`disagreements: ${summary.disagreements.length}`));
    }

    if (summary.open_questions.length > 0) {
      log(chalk.white(`open_questions: ${summary.open_questions.join(' | ')}`));
    }
  }

  return {
    render(event) {
      switch (event.type) {
        case 'progress':
          if (usePanels && isPanelPhase(event.data.phase)) {
            panelState.startRound({
              round: event.data.round,
              phase: event.data.phase,
            });
          } else if (usePanels) {
            panelState.finishRound();
          }

          if (!roundStartedAt.has(event.data.round)) {
            roundStartedAt.set(event.data.round, now());
          }

          if (usePanels && isPanelPhase(event.data.phase)) {
            return;
          }

          log(
            chalk.cyan(
              `[stage] Round ${event.data.round}/${event.data.total_rounds} - ${formatCliPhaseLabel(event.data.phase)}`
            )
          );
          return;
        case 'chunk': {
          const key = `${event.data.round}:${event.data.logical_model_id}`;
          streamBuffers.set(key, `${streamBuffers.get(key) ?? ''}${event.data.content}`);

          if (usePanels) {
            panelState.appendChunk({
              round: event.data.round,
              modelId: event.data.logical_model_id,
              text: event.data.content,
            });
          }

          return;
        }
        case 'model_done': {
          const key = `${event.data.round}:${event.data.logical_model_id}`;
          const text = consumeStreamBuffer(key);
          setRoundOutput(event.data.round, event.data.logical_model_id, text);
          if (usePanels) {
            panelState.markDone({
              round: event.data.round,
              modelId: event.data.logical_model_id,
              inputTokens: event.data.tokens.input,
              outputTokens: event.data.tokens.output,
            });
            return;
          }
          flushModelTranscript({
            round: event.data.round,
            modelId: event.data.logical_model_id,
            text,
          });
          log(
            chalk.green(
              `[model_done] ${event.data.logical_model_id} r${event.data.round} input=${event.data.tokens.input} output=${event.data.tokens.output}`
            )
          );
          return;
        }
        case 'model_error': {
          const key = `${event.data.round}:${event.data.logical_model_id}`;
          const partialText = consumeStreamBuffer(key);
          if (usePanels) {
            if (partialText) {
              panelState.appendChunk({
                round: event.data.round,
                modelId: event.data.logical_model_id,
                text: partialText,
              });
            }
            panelState.markError({
              round: event.data.round,
              modelId: event.data.logical_model_id,
              errorType: event.data.error_type,
              action: event.data.action,
            });
            return;
          }
          flushModelTranscript({
            round: event.data.round,
            modelId: event.data.logical_model_id,
            text: partialText,
            partial: true,
          });
          error(
            chalk.red(
              `[model_error] ${event.data.logical_model_id} r${event.data.round} ${event.data.error_type} -> ${event.data.action}: ${event.data.message}`
            )
          );
          return;
        }
        case 'round_done':
          {
            if (usePanels) {
              panelState.finishRound();
            }
            const startedAt = roundStartedAt.get(event.data.round);
            const durationText =
              startedAt !== undefined
                ? ` duration=${formatCliElapsedMs(now() - startedAt)}`
                : '';
            const failedCount = event.data.failed_models.length;

          log(
            chalk.magenta(
              `[round_done] r${event.data.round} completed=${event.data.completed_models.length}/${event.data.total_models} skipped=${event.data.skipped_models.length} failed=${failedCount}${durationText}`
            )
          );
          renderRoundRecap(event.data.round);
          return;
          }
        case 'round_summary':
          if (usePanels) {
            panelState.finishRound();
          }
          renderSummaryBlock(`round_summary r${event.data.round}`, event.data);
          if (event.data.next_round !== null) {
            log(chalk.white(`next_round: ${event.data.next_round}`));
          }
          return;
        case 'anonymize':
          if (usePanels) {
            panelState.finishRound();
          }
          log(
            chalk.yellow(
              `[anonymize] r${event.data.round} labels ready: ${event.data.labels.join(', ')}`
            )
          );
          return;
        case 'summary':
          if (usePanels) {
            panelState.finishRound();
          }
          renderSummaryBlock('summary', event.data);
          return;
        case 'done':
          if (usePanels) {
            panelState.finishRound();
          }
          log(
            chalk.green(
              `[done] total_raw_cost=${event.data.total_raw_cost} total_platform_price=${event.data.total_platform_price}`
            )
          );
          return;
        case 'restore':
          if (usePanels) {
            panelState.finishRound();
          }
          log(
            chalk.yellow(
              `[restore] status=${event.data.current_status} current_round=${event.data.current_round} last_completed_round=${event.data.last_completed_round}`
            )
          );
          return;
        case 'error':
          if (usePanels) {
            panelState.finishRound();
          }
          error(chalk.red(`[error] ${event.data.code}: ${event.data.message}`));
          return;
        case 'interrupt_ack':
          if (usePanels) {
            panelState.finishRound();
          }
          log(chalk.yellow(`[interrupt_ack] ${event.data.message}`));
          return;
      }
    },
  };
}

function extractPreview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '(no content)';
  }

  const sentence = normalized.split(/(?<=[。！？.!?])\s+/u)[0] ?? normalized;
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

function isPanelPhase(phase: string): boolean {
  return phase === 'independent' || phase === 'anonymous_review' || phase === 'rebuttal';
}

function createPanelState(params: {
  stdout: CliWriteStream;
  now: () => number;
  panelHeight: number;
  getModelIds?: () => string[];
}) {
  const contents = new Map<string, string>();
  const statuses = new Map<string, string>();
  let activeRound: number | null = null;
  let activePhase: string | null = null;
  let renderedLines = 0;
  let modelOrder: string[] = [];

  function ensureModel(modelId: string): void {
    if (!modelOrder.includes(modelId)) {
      modelOrder.push(modelId);
    }

    if (!contents.has(modelId)) {
      contents.set(modelId, '');
    }

    if (!statuses.has(modelId)) {
      statuses.set(modelId, 'pending');
    }
  }

  function moveCursorUp(lines: number): void {
    if (lines > 0) {
      params.stdout.write(`\x1b[${lines}A`);
    }
  }

  function clearLine(): void {
    params.stdout.write('\r\x1b[2K');
  }

  function render(): void {
    if (activeRound === null) {
      return;
    }

    const lines = buildPanelLines({
      round: activeRound,
      phase: activePhase ?? 'independent',
      modelOrder,
      contents,
      statuses,
      width: Math.max((params.stdout.columns ?? 100) - 6, 24),
      panelHeight: params.panelHeight,
      now: params.now,
    });

    if (renderedLines > 0) {
      moveCursorUp(renderedLines);
    }

    for (const line of lines) {
      clearLine();
      params.stdout.write(`${line}\n`);
    }

    renderedLines = lines.length;
  }

  return {
    startRound(paramsInput: { round: number; phase: string }) {
      if (activeRound !== paramsInput.round) {
        contents.clear();
        statuses.clear();
        modelOrder = [...(params.getModelIds?.() ?? [])];
        for (const modelId of modelOrder) {
          ensureModel(modelId);
        }
        renderedLines = 0;
      }

      activeRound = paramsInput.round;
      activePhase = paramsInput.phase;
      render();
    },
    appendChunk(paramsInput: { round: number; modelId: string; text: string }) {
      if (activeRound !== paramsInput.round) {
        this.startRound({ round: paramsInput.round, phase: activePhase ?? 'independent' });
      }

      ensureModel(paramsInput.modelId);
      statuses.set(paramsInput.modelId, 'streaming');
      contents.set(paramsInput.modelId, `${contents.get(paramsInput.modelId) ?? ''}${paramsInput.text}`);
      render();
    },
    markDone(paramsInput: {
      round: number;
      modelId: string;
      inputTokens: number;
      outputTokens: number;
    }) {
      if (activeRound !== paramsInput.round) {
        this.startRound({ round: paramsInput.round, phase: activePhase ?? 'independent' });
      }

      ensureModel(paramsInput.modelId);
      statuses.set(
        paramsInput.modelId,
        `done in=${paramsInput.inputTokens} out=${paramsInput.outputTokens}`
      );
      render();
    },
    markError(paramsInput: {
      round: number;
      modelId: string;
      errorType: string;
      action: string;
    }) {
      if (activeRound !== paramsInput.round) {
        this.startRound({ round: paramsInput.round, phase: activePhase ?? 'independent' });
      }

      ensureModel(paramsInput.modelId);
      statuses.set(paramsInput.modelId, `${paramsInput.action}/${paramsInput.errorType}`);
      render();
    },
    finishRound() {
      activeRound = null;
      activePhase = null;
      renderedLines = 0;
    },
  };
}

function buildPanelLines(params: {
  round: number;
  phase: string;
  modelOrder: string[];
  contents: Map<string, string>;
  statuses: Map<string, string>;
  width: number;
  panelHeight: number;
  now: () => number;
}): string[] {
  void params.now;
  const lines: string[] = [];
  const panelWidth = Math.max(Math.min(params.width, 72), 24);
  const contentWidth = Math.max(panelWidth - 2, 12);
  const separator = chalk.gray('─'.repeat(panelWidth));
  const title = chalk.cyan(
    fitTerminalLine(`[live] Round ${params.round} - ${formatCliPhaseLabel(params.phase)}`, panelWidth)
  );
  lines.push(title);
  lines.push(separator);

  for (const [modelIndex, modelId] of params.modelOrder.entries()) {
    const status = params.statuses.get(modelId) ?? 'pending';
    const headerLine = fitTerminalLine(
      `[${modelIndex + 1}/${params.modelOrder.length}] ${modelId} (${status})`,
      panelWidth
    );
    lines.push(chalk.blueBright(headerLine));

    const wrapped = wrapPanelText(params.contents.get(modelId) ?? '', contentWidth);
    const visible = wrapped.slice(-params.panelHeight);

    for (let index = 0; index < params.panelHeight; index += 1) {
      const content = fitTerminalLine(visible[index] ?? '', contentWidth);
      lines.push(chalk.gray('│ ') + content);
    }

    lines.push(separator);
  }

  return lines;
}

function wrapPanelText(text: string, width: number): string[] {
  const normalized = text.replace(/\r/g, '');
  const rawLines = normalized.split('\n');
  const output: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();

    if (!line) {
      output.push('');
      continue;
    }

    output.push(...splitByDisplayWidth(line, width));
  }

  return output.length > 0 ? output : [''];
}

function fitTerminalLine(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  const stripped = stripAnsi(text);
  if (getDisplayWidth(stripped) <= width) {
    return stripped;
  }

  if (width === 1) {
    return '…';
  }

  return `${sliceByDisplayWidth(stripped, width - 1)}…`;
}

function splitByDisplayWidth(text: string, width: number): string[] {
  if (width <= 0) {
    return [''];
  }

  const chunks: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = getCharDisplayWidth(char);

    if (currentWidth > 0 && currentWidth + charWidth > width) {
      chunks.push(current);
      current = char;
      currentWidth = charWidth;
      continue;
    }

    current += char;
    currentWidth += charWidth;
  }

  if (current || chunks.length === 0) {
    chunks.push(current);
  }

  return chunks;
}

function sliceByDisplayWidth(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  let output = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = getCharDisplayWidth(char);
    if (currentWidth + charWidth > width) {
      break;
    }

    output += char;
    currentWidth += charWidth;
  }

  return output;
}

function stripAnsi(text: string): string {
  let output = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '\u001B' && text[index + 1] === '[') {
      index += 2;

      while (index < text.length) {
        const code = text.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
        index += 1;
      }

      continue;
    }

    output += char;
  }

  return output;
}

function getDisplayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += getCharDisplayWidth(char);
  }

  return width;
}

function getCharDisplayWidth(char: string): number {
  const codePoint = char.codePointAt(0);

  if (codePoint === undefined) {
    return 0;
  }

  if (
    codePoint >= 0x1100 &&
    (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faf6) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  ) {
    return 2;
  }

  return 1;
}

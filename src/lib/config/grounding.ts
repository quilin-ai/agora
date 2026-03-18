type GroundingEnv = Readonly<Record<string, string | undefined>>;

export type GroundingMode = 'off' | 'auto' | 'always';
export type GroundingProvider = 'duckduckgo';
export type GroundingScenario = 'ask' | 'council';

export interface GroundingConfig {
  mode: GroundingMode;
  provider: GroundingProvider;
  maxResults: number;
  timeoutMs: number;
  summaryModel: string | null;
}

export class GroundingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroundingConfigError';
  }
}

const CURRENT_AWARE_PATTERNS = [
  /今天|今日|昨天|明天|最近|最新|当前|现在|刚刚|目前|本周|本月|今年|明年/u,
  /战争|局势|新闻|股价|股票|油价|汇率|利率|财报|总统|大选|政策|关税|通胀/u,
  /\b(today|latest|recent|current|now|this week|this month|this year|stock|price|war|news|president|election|tariff|inflation|rate|earnings)\b/i,
  /\b20(2[4-9]|3\d)\b/,
] as const;

export function loadGroundingConfig(env: GroundingEnv = process.env): GroundingConfig {
  return {
    mode: parseGroundingMode(env.AGORA_GROUNDING_MODE),
    provider: parseGroundingProvider(env.AGORA_GROUNDING_PROVIDER),
    maxResults: parsePositiveInteger(env.AGORA_GROUNDING_MAX_RESULTS, 5, 'AGORA_GROUNDING_MAX_RESULTS'),
    timeoutMs: parsePositiveInteger(env.AGORA_GROUNDING_TIMEOUT_MS, 20_000, 'AGORA_GROUNDING_TIMEOUT_MS'),
    summaryModel: env.AGORA_GROUNDING_MODEL?.trim() || null,
  };
}

export function shouldUseGrounding(params: {
  topic: string;
  scenario: GroundingScenario;
  config: GroundingConfig;
}): boolean {
  switch (params.config.mode) {
    case 'off':
      return false;
    case 'always':
      return true;
    case 'auto':
      if (params.scenario === 'council') {
        return true;
      }

      return CURRENT_AWARE_PATTERNS.some((pattern) => pattern.test(params.topic));
  }
}

function parseGroundingMode(value: string | undefined): GroundingMode {
  if (!value) {
    return 'auto';
  }

  if (value === 'off' || value === 'auto' || value === 'always') {
    return value;
  }

  throw new GroundingConfigError(`Unsupported AGORA_GROUNDING_MODE: ${value}`);
}

function parseGroundingProvider(value: string | undefined): GroundingProvider {
  if (!value) {
    return 'duckduckgo';
  }

  if (value === 'duckduckgo') {
    return value;
  }

  throw new GroundingConfigError(`Unsupported AGORA_GROUNDING_PROVIDER: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  field: string
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new GroundingConfigError(`${field} must be a positive integer`);
  }

  return parsed;
}

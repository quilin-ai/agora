import { setTimeout as delay } from 'node:timers/promises';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

type RuntimeEnv = Readonly<Record<string, string | undefined>>;

type DatabaseClient = ReturnType<typeof postgres>;
type DatabaseInstance = ReturnType<typeof drizzle>;

type DatabaseConnectionSource = 'pooler' | 'direct';

interface DatabaseConnectionCandidate {
  url: string;
  source: DatabaseConnectionSource;
  label: string;
  prepare: boolean;
}

interface DatabaseRuntimeConfig {
  candidates: DatabaseConnectionCandidate[];
  connectTimeoutSeconds: number;
  idleTimeoutSeconds: number;
  maxConnections: number;
  maxLifetimeSeconds: number;
  keepAliveSeconds: number;
  readyRetries: number;
  readyRetryDelayMs: number;
}

interface DatabaseRuntimeState {
  config: DatabaseRuntimeConfig;
  activeCandidateIndex: number;
  db: DatabaseInstance;
  client: DatabaseClient;
}

interface EnsureDatabaseReadyOptions {
  attempts?: number;
  delayMs?: number;
  label?: string;
}

export interface DatabaseConnectionDiagnostics {
  active: {
    source: DatabaseConnectionSource;
    label: string;
  };
  fallbackSources: DatabaseConnectionSource[];
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

export class DatabaseConnectionError extends Error {
  cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DatabaseConnectionError';
    this.cause = options?.cause;
  }
}

const DEFAULT_CONNECT_TIMEOUT_SECONDS = 10;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 20;
const DEFAULT_MAX_CONNECTIONS = 5;
const DEFAULT_MAX_LIFETIME_SECONDS = 60 * 30;
const DEFAULT_KEEP_ALIVE_SECONDS = 30;
const DEFAULT_READY_RETRIES = 4;
const DEFAULT_READY_RETRY_DELAY_MS = 1_500;

const RETRYABLE_CONNECTION_CODES = new Set([
  'CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

let runtimeState: DatabaseRuntimeState | null = null;

export function loadDatabaseRuntimeConfig(env: RuntimeEnv = process.env): DatabaseRuntimeConfig {
  const sessionPoolerUrl = env.DATABASE_SESSION_POOLER_URL?.trim();
  const transactionPoolerUrl = env.DATABASE_TRANSACTION_POOLER_URL?.trim();
  const poolerUrl = env.DATABASE_POOLER_URL?.trim();
  const directUrl = env.DATABASE_URL?.trim();

  if (!sessionPoolerUrl && !transactionPoolerUrl && !poolerUrl && !directUrl) {
    throw new DatabaseConfigError(
      'DATABASE_URL environment variable is required. ' +
        'Use ./run.sh test|prod with a populated .env.test or .env.prod file.'
    );
  }

  const candidates: DatabaseConnectionCandidate[] = [];

  if (sessionPoolerUrl) {
    candidates.push({
      url: assertValidDatabaseUrl(sessionPoolerUrl, 'DATABASE_SESSION_POOLER_URL'),
      source: 'pooler',
      label: 'DATABASE_SESSION_POOLER_URL',
      prepare: false,
    });
  }

  if (transactionPoolerUrl) {
    candidates.push({
      url: assertValidDatabaseUrl(transactionPoolerUrl, 'DATABASE_TRANSACTION_POOLER_URL'),
      source: 'pooler',
      label: 'DATABASE_TRANSACTION_POOLER_URL',
      prepare: false,
    });
  }

  if (poolerUrl) {
    candidates.push({
      url: assertValidDatabaseUrl(poolerUrl, 'DATABASE_POOLER_URL'),
      source: 'pooler',
      label: 'DATABASE_POOLER_URL',
      prepare: false,
    });
  }

  if (directUrl) {
    const validatedDirectUrl = assertValidDatabaseUrl(directUrl, 'DATABASE_URL');
    const inferredSupabasePoolerUrl =
      sessionPoolerUrl || transactionPoolerUrl || poolerUrl
        ? null
        : inferSupabaseTransactionPoolerUrl(validatedDirectUrl);

    if (inferredSupabasePoolerUrl) {
      candidates.push({
        url: inferredSupabasePoolerUrl,
        source: 'pooler',
        label: 'DATABASE_URL#derived-transaction-pooler',
        prepare: false,
      });
    }

    candidates.push({
      url: validatedDirectUrl,
      source: 'direct',
      label: 'DATABASE_URL',
      prepare: true,
    });
  }

  return {
    candidates,
    connectTimeoutSeconds: parsePositiveInt(
      env.DATABASE_CONNECT_TIMEOUT_SECONDS,
      DEFAULT_CONNECT_TIMEOUT_SECONDS,
      'DATABASE_CONNECT_TIMEOUT_SECONDS'
    ),
    idleTimeoutSeconds: parsePositiveInt(
      env.DATABASE_IDLE_TIMEOUT_SECONDS,
      DEFAULT_IDLE_TIMEOUT_SECONDS,
      'DATABASE_IDLE_TIMEOUT_SECONDS'
    ),
    maxConnections: parsePositiveInt(
      env.DATABASE_MAX_CONNECTIONS,
      DEFAULT_MAX_CONNECTIONS,
      'DATABASE_MAX_CONNECTIONS'
    ),
    maxLifetimeSeconds: parsePositiveInt(
      env.DATABASE_MAX_LIFETIME_SECONDS,
      DEFAULT_MAX_LIFETIME_SECONDS,
      'DATABASE_MAX_LIFETIME_SECONDS'
    ),
    keepAliveSeconds: parsePositiveInt(
      env.DATABASE_KEEP_ALIVE_SECONDS,
      DEFAULT_KEEP_ALIVE_SECONDS,
      'DATABASE_KEEP_ALIVE_SECONDS'
    ),
    readyRetries: parsePositiveInt(
      env.DATABASE_READY_RETRIES,
      DEFAULT_READY_RETRIES,
      'DATABASE_READY_RETRIES'
    ),
    readyRetryDelayMs: parsePositiveInt(
      env.DATABASE_READY_RETRY_DELAY_MS,
      DEFAULT_READY_RETRY_DELAY_MS,
      'DATABASE_READY_RETRY_DELAY_MS'
    ),
  };
}

export function isRetryableDatabaseError(error: unknown): boolean {
  for (const candidate of collectErrorChain(error)) {
    const code =
      candidate && typeof candidate === 'object' && 'code' in candidate
        ? String(candidate.code)
        : undefined;
    const message = candidate instanceof Error ? candidate.message : String(candidate);

    if (code && RETRYABLE_CONNECTION_CODES.has(code)) {
      return true;
    }

    if (
      message.includes('CONNECT_TIMEOUT') ||
      message.includes('connection terminated unexpectedly') ||
      message.includes('terminating connection') ||
      message.includes('Connection terminated unexpectedly')
    ) {
      return true;
    }
  }

  return false;
}

export async function ensureDatabaseReady(
  options: EnsureDatabaseReadyOptions = {}
): Promise<void> {
  const runtime = getRuntimeState();
  const attempts = options.attempts ?? runtime.config.readyRetries;
  const delayMs = options.delayMs ?? runtime.config.readyRetryDelayMs;
  const label = options.label ?? 'database';

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const state = getRuntimeState();
      await state.client`select 1`;
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableDatabaseError(error) || attempt === attempts) {
        break;
      }

      await rotateDatabaseConnection();
      await delay(delayMs);
    }
  }

  const diagnostics = getDatabaseConnectionDiagnostics();
  const hint =
    diagnostics.active.source === 'direct' && diagnostics.fallbackSources.length === 0
      ? ' Configure DATABASE_SESSION_POOLER_URL or DATABASE_POOLER_URL with the Supabase pooler connection string for stable runtime access.'
      : '';
  throw new DatabaseConnectionError(
    `Failed to establish a stable ${label} connection after ${attempts} attempts ` +
      `(active=${diagnostics.active.label}, fallbacks=${diagnostics.fallbackSources.join(',') || 'none'}).${hint}`,
    { cause: lastError }
  );
}

export function getDatabaseConnectionDiagnostics(): DatabaseConnectionDiagnostics {
  const runtime = getRuntimeState();

  return {
    active: {
      source: runtime.config.candidates[runtime.activeCandidateIndex].source,
      label: runtime.config.candidates[runtime.activeCandidateIndex].label,
    },
    fallbackSources: runtime.config.candidates
      .filter((_, index) => index !== runtime.activeCandidateIndex)
      .map((candidate) => candidate.source),
  };
}

export async function resetDatabaseRuntime(): Promise<void> {
  if (!runtimeState) {
    return;
  }

  const active = runtimeState;
  runtimeState = null;
  await active.client.end({ timeout: 0 });
}

export const db = new Proxy({} as DatabaseInstance, {
  get(_target, property) {
    const value = Reflect.get(getRuntimeState().db as object, property);
    return typeof value === 'function' ? value.bind(getRuntimeState().db) : value;
  },
}) as DatabaseInstance;

export const dbClient = new Proxy({} as DatabaseClient, {
  get(_target, property) {
    if (property === 'end') {
      return async (...args: Parameters<DatabaseClient['end']>) => {
        const active = runtimeState;
        runtimeState = null;

        if (!active) {
          return;
        }

        return active.client.end(...args);
      };
    }

    const value = Reflect.get(getRuntimeState().client as object, property);
    return typeof value === 'function' ? value.bind(getRuntimeState().client) : value;
  },
}) as DatabaseClient;

function getRuntimeState(): DatabaseRuntimeState {
  if (!runtimeState) {
    runtimeState = createRuntimeState(loadDatabaseRuntimeConfig());
  }

  return runtimeState;
}

function createRuntimeState(config: DatabaseRuntimeConfig): DatabaseRuntimeState {
  const bundle = createConnectionBundle(config.candidates[0], config);

  return {
    config,
    activeCandidateIndex: 0,
    db: bundle.db,
    client: bundle.client,
  };
}

function createConnectionBundle(
  candidate: DatabaseConnectionCandidate,
  config: DatabaseRuntimeConfig
): { db: DatabaseInstance; client: DatabaseClient } {
  const client = postgres(candidate.url, {
    ssl: 'require',
    connect_timeout: config.connectTimeoutSeconds,
    idle_timeout: config.idleTimeoutSeconds,
    max: config.maxConnections,
    max_lifetime: config.maxLifetimeSeconds,
    keep_alive: config.keepAliveSeconds,
    prepare: candidate.prepare,
    onnotice: () => undefined,
    connection: {
      application_name: `agora:${candidate.source}`,
    },
  });

  return {
    client,
    db: drizzle(client),
  };
}

async function rotateDatabaseConnection(): Promise<void> {
  const runtime = getRuntimeState();
  const nextIndex =
    runtime.config.candidates.length === 1
      ? runtime.activeCandidateIndex
      : (runtime.activeCandidateIndex + 1) % runtime.config.candidates.length;

  const currentClient = runtime.client;
  const nextBundle = createConnectionBundle(runtime.config.candidates[nextIndex], runtime.config);

  runtime.activeCandidateIndex = nextIndex;
  runtime.client = nextBundle.client;
  runtime.db = nextBundle.db;

  await currentClient.end({ timeout: 0 }).catch(() => undefined);
}

function assertValidDatabaseUrl(value: string, envName: string): string {
  try {
    const parsed = new URL(value);

    if (!parsed.protocol.startsWith('postgres')) {
      throw new DatabaseConfigError(`${envName} must use a postgres:// or postgresql:// URL`);
    }

    return parsed.toString();
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      throw error;
    }

    throw new DatabaseConfigError(`${envName} is not a valid database URL`);
  }
}

function inferSupabaseTransactionPoolerUrl(directUrl: string): string | null {
  const parsed = new URL(directUrl);

  if (!/^db\.[^.]+\.supabase\.co$/u.test(parsed.hostname)) {
    return null;
  }

  parsed.port = '6543';
  return parsed.toString();
}

function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
  envName: string
): number {
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new DatabaseConfigError(`${envName} must be a positive integer`);
  }

  return value;
}

function collectErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 8) {
    chain.push(current);

    if (
      typeof current === 'object' &&
      current !== null &&
      'cause' in current &&
      current.cause &&
      current.cause !== current
    ) {
      current = current.cause;
      depth += 1;
      continue;
    }

    break;
  }

  return chain;
}

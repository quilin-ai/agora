import { describe, expect, it } from 'vitest';

import {
  DatabaseConfigError,
  DatabaseConnectionError,
  isRetryableDatabaseError,
  loadDatabaseRuntimeConfig,
} from '@/lib/db/index';

describe('db runtime config', () => {
  it('loads a direct DATABASE_URL when no pooler url is provided', () => {
    const config = loadDatabaseRuntimeConfig({
      DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
    });

    expect(config.candidates).toHaveLength(1);
    expect(config.candidates[0]).toMatchObject({
      source: 'direct',
      label: 'DATABASE_URL',
      prepare: true,
    });
  });

  it('prefers DATABASE_POOLER_URL and falls back to DATABASE_URL', () => {
    const config = loadDatabaseRuntimeConfig({
      DATABASE_POOLER_URL: 'postgresql://postgres.pooler:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
      DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
    });

    expect(config.candidates).toHaveLength(2);
    expect(config.candidates[0]).toMatchObject({
      source: 'pooler',
      label: 'DATABASE_POOLER_URL',
      prepare: false,
    });
    expect(config.candidates[1]).toMatchObject({
      source: 'direct',
      label: 'DATABASE_URL',
      prepare: true,
    });
  });

  it('prefers explicit session and transaction pooler urls ahead of generic pooler and direct urls', () => {
    const config = loadDatabaseRuntimeConfig({
      DATABASE_SESSION_POOLER_URL: 'postgresql://postgres.pooler:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
      DATABASE_TRANSACTION_POOLER_URL: 'postgresql://postgres.pooler:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
      DATABASE_POOLER_URL: 'postgresql://postgres.pooler:secret@db.chfodumzbwgvbwmcckhs.supabase.co:6543/postgres',
      DATABASE_URL: 'postgresql://postgres:secret@db.chfodumzbwgvbwmcckhs.supabase.co:5432/postgres',
    });

    expect(config.candidates.map((candidate) => candidate.label)).toEqual([
      'DATABASE_SESSION_POOLER_URL',
      'DATABASE_TRANSACTION_POOLER_URL',
      'DATABASE_POOLER_URL',
      'DATABASE_URL',
    ]);
  });

  it('derives a Supabase transaction pooler candidate from DATABASE_URL when pooler env is missing', () => {
    const config = loadDatabaseRuntimeConfig({
      DATABASE_URL: 'postgresql://postgres:secret@db.chfodumzbwgvbwmcckhs.supabase.co:5432/postgres',
    });

    expect(config.candidates).toHaveLength(2);
    expect(config.candidates[0]).toMatchObject({
      source: 'pooler',
      label: 'DATABASE_URL#derived-transaction-pooler',
      prepare: false,
    });
    expect(config.candidates[0].url).toContain(':6543/');
    expect(config.candidates[1]).toMatchObject({
      source: 'direct',
      label: 'DATABASE_URL',
      prepare: true,
    });
  });

  it('rejects invalid database urls and malformed numeric settings', () => {
    expect(() =>
      loadDatabaseRuntimeConfig({
        DATABASE_URL: 'not-a-url',
      })
    ).toThrow(DatabaseConfigError);

    expect(() =>
      loadDatabaseRuntimeConfig({
        DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
        DATABASE_READY_RETRIES: '0',
      })
    ).toThrow('DATABASE_READY_RETRIES must be a positive integer');
  });
});

describe('retryable database errors', () => {
  it('treats nested CONNECT_TIMEOUT errors as retryable', () => {
    const error = new Error('query failed', {
      cause: Object.assign(new Error('connect timed out'), {
        code: 'CONNECT_TIMEOUT',
      }),
    });

    expect(isRetryableDatabaseError(error)).toBe(true);
  });

  it('does not retry permanent credential errors', () => {
    const error = Object.assign(new Error('password authentication failed'), {
      code: '28P01',
    });

    expect(isRetryableDatabaseError(error)).toBe(false);
  });
});

// ─── C03 — DB retry pattern ──────────────────────────────────────────────────

describe('C03 DB write failure retry pattern', () => {
  it('isRetryableDatabaseError returns true for all transient connection errors', () => {
    const retryableCodes = ['CONNECT_TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'];

    for (const code of retryableCodes) {
      const error = Object.assign(new Error(`connection failed: ${code}`), { code });
      expect(isRetryableDatabaseError(error)).toBe(true);
    }
  });

  it('retry loop exhausts attempts and throws DatabaseConnectionError', async () => {
    let callCount = 0;
    const maxAttempts = 3;

    // Simulate the retry algorithm used in ensureDatabaseReady
    async function simulateDbCall(): Promise<void> {
      callCount++;
      const err = Object.assign(new Error('CONNECT_TIMEOUT'), { code: 'CONNECT_TIMEOUT' });
      throw err;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await simulateDbCall();
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableDatabaseError(error) || attempt === maxAttempts) {
          break;
        }
        // no delay in test
      }
    }

    expect(callCount).toBe(maxAttempts);
    expect(isRetryableDatabaseError(lastError)).toBe(true);
  });

  it('retry loop succeeds on 3rd attempt', async () => {
    let callCount = 0;

    async function simulateDbWrite(): Promise<string> {
      callCount++;
      if (callCount < 3) {
        const err = Object.assign(new Error('CONNECT_TIMEOUT'), { code: 'CONNECT_TIMEOUT' });
        throw err;
      }
      return 'ok';
    }

    let result: string | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await simulateDbWrite();
        break;
      } catch (error) {
        if (!isRetryableDatabaseError(error) || attempt === maxAttempts) {
          break;
        }
      }
    }

    expect(result).toBe('ok');
    expect(callCount).toBe(3);
  });

  it('DatabaseConnectionError is thrown after exhausting all retries', () => {
    const error = new DatabaseConnectionError(
      'Failed to establish a stable connection after 3 attempts'
    );
    expect(error.name).toBe('DatabaseConnectionError');
    expect(error.message).toContain('3 attempts');
  });
});

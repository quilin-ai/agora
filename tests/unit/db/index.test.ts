import { describe, expect, it } from 'vitest';

import {
  DatabaseConfigError,
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

import { describe, expect, it } from 'vitest';

import {
  loadAgoraModelConfig,
  ModelConfigError,
  parseModelList,
  resolveAskModel,
  resolveCouncilModels,
} from '@/lib/config/models';

describe('model configuration', () => {
  it('parses and deduplicates comma-separated model lists', () => {
    expect(
      parseModelList('a, b, a,openai/gpt-oss-120b:free, openai/gpt-oss-120b:free')
    ).toEqual(['a', 'b', 'openai/gpt-oss-120b:free']);
  });

  it('loads a valid runtime model configuration from environment variables', () => {
    const config = loadAgoraModelConfig({
      AGORA_ALLOWED_MODELS: 'm1,m2,m3,m4',
      AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2,m3',
      AGORA_SECRETARY_MODEL: 'm4',
      AGORA_ROUND_SUMMARY_MODEL: 'm2',
    });

    expect(config.source).toBe('openrouter');
    expect(config.allowedModels).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(config.defaultCouncilModels).toEqual(['m1', 'm2', 'm3']);
    expect(config.secretaryModel).toBe('m4');
    expect(config.roundSummaryModel).toBe('m2');
  });

  it('falls back to the first council model when secretary model is omitted', () => {
    const config = loadAgoraModelConfig({
      AGORA_ALLOWED_MODELS: 'm1,m2,m3',
      AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2,m3',
    });

    expect(config.secretaryModel).toBe('m1');
    expect(config.roundSummaryModel).toBeNull();
  });

  it('rejects round summary model outside the whitelist', () => {
    expect(() =>
      loadAgoraModelConfig({
        AGORA_ALLOWED_MODELS: 'm1,m2',
        AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2',
        AGORA_ROUND_SUMMARY_MODEL: 'm3',
      })
    ).toThrowError(
      new ModelConfigError(
        'AGORA_ROUND_SUMMARY_MODEL must be present in AGORA_ALLOWED_MODELS: m3'
      )
    );
  });

  it('rejects unsupported model sources', () => {
    expect(() =>
      loadAgoraModelConfig({
        AGORA_MODEL_SOURCE: 'anthropic',
        AGORA_ALLOWED_MODELS: 'm1,m2',
        AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2',
      })
    ).toThrowError(new ModelConfigError('Unsupported AGORA_MODEL_SOURCE: anthropic'));
  });

  it('rejects default council models outside the whitelist', () => {
    expect(() =>
      loadAgoraModelConfig({
        AGORA_ALLOWED_MODELS: 'm1,m2',
        AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m3',
      })
    ).toThrowError(
      new ModelConfigError(
        'AGORA_DEFAULT_COUNCIL_MODELS contains model not present in AGORA_ALLOWED_MODELS: m3'
      )
    );
  });

  it('rejects council selections outside the whitelist', () => {
    const config = loadAgoraModelConfig({
      AGORA_ALLOWED_MODELS: 'm1,m2,m3',
      AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2,m3',
    });

    expect(() =>
      resolveCouncilModels({
        config,
        requestedModels: ['m1', 'm9'],
      })
    ).toThrowError(new ModelConfigError('Model is not allowed by AGORA_ALLOWED_MODELS: m9'));
  });

  it('rejects council selections with fewer than two models', () => {
    const config = loadAgoraModelConfig({
      AGORA_ALLOWED_MODELS: 'm1,m2,m3',
      AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2,m3',
    });

    expect(() =>
      resolveCouncilModels({
        config,
        requestedModels: ['m1'],
      })
    ).toThrowError(
      new ModelConfigError('Council discussions require at least two participant models')
    );
  });

  it('resolves ask model from requested value or secretary fallback', () => {
    const config = loadAgoraModelConfig({
      AGORA_ALLOWED_MODELS: 'm1,m2,m3',
      AGORA_DEFAULT_COUNCIL_MODELS: 'm1,m2',
      AGORA_SECRETARY_MODEL: 'm3',
    });

    expect(resolveAskModel({ config, requestedModel: 'm2' })).toBe('m2');
    expect(resolveAskModel({ config })).toBe('m3');
  });
});

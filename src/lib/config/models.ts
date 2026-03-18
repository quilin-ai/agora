export type ModelSource = 'openrouter';

type ModelEnv = Readonly<Record<string, string | undefined>>;

export interface AgoraModelConfig {
  source: ModelSource;
  allowedModels: string[];
  defaultCouncilModels: string[];
  secretaryModel: string;
  roundSummaryModel: string | null;
}

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

export const RECOMMENDED_FREE_MODEL_WHITELIST = [
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'google/gemma-3-27b-it:free',
] as const;

export const RECOMMENDED_FREE_COUNCIL_MODELS = [
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
] as const;

export const DEFAULT_MODEL_SOURCE: ModelSource = 'openrouter';

export function loadAgoraModelConfig(env: ModelEnv = process.env): AgoraModelConfig {
  const source = normalizeModelSource(env.AGORA_MODEL_SOURCE);
  const allowedModels = parseModelList(env.AGORA_ALLOWED_MODELS);
  const defaultCouncilModels = parseModelList(env.AGORA_DEFAULT_COUNCIL_MODELS);
  const secretaryModel = env.AGORA_SECRETARY_MODEL?.trim();
  const roundSummaryModel = env.AGORA_ROUND_SUMMARY_MODEL?.trim() || null;

  if (allowedModels.length === 0) {
    throw new ModelConfigError(
      'AGORA_ALLOWED_MODELS is required and must contain at least one model ID'
    );
  }

  if (defaultCouncilModels.length < 2) {
    throw new ModelConfigError(
      'AGORA_DEFAULT_COUNCIL_MODELS must contain at least two model IDs'
    );
  }

  for (const modelId of defaultCouncilModels) {
    if (!allowedModels.includes(modelId)) {
      throw new ModelConfigError(
        `AGORA_DEFAULT_COUNCIL_MODELS contains model not present in AGORA_ALLOWED_MODELS: ${modelId}`
      );
    }
  }

  const resolvedSecretaryModel = secretaryModel || defaultCouncilModels[0];

  if (!allowedModels.includes(resolvedSecretaryModel)) {
    throw new ModelConfigError(
      `AGORA_SECRETARY_MODEL must be present in AGORA_ALLOWED_MODELS: ${resolvedSecretaryModel}`
    );
  }

  if (roundSummaryModel && !allowedModels.includes(roundSummaryModel)) {
    throw new ModelConfigError(
      `AGORA_ROUND_SUMMARY_MODEL must be present in AGORA_ALLOWED_MODELS: ${roundSummaryModel}`
    );
  }

  return {
    source,
    allowedModels,
    defaultCouncilModels,
    secretaryModel: resolvedSecretaryModel,
    roundSummaryModel,
  };
}

export function resolveCouncilModels(params: {
  config: AgoraModelConfig;
  requestedModels?: string[];
}): string[] {
  const requestedModels =
    params.requestedModels && params.requestedModels.length > 0
      ? dedupeModelList(params.requestedModels)
      : params.config.defaultCouncilModels;

  if (requestedModels.length < 2) {
    throw new ModelConfigError('Council discussions require at least two participant models');
  }

  for (const modelId of requestedModels) {
    if (!params.config.allowedModels.includes(modelId)) {
      throw new ModelConfigError(`Model is not allowed by AGORA_ALLOWED_MODELS: ${modelId}`);
    }
  }

  return requestedModels;
}

export function resolveAskModel(params: {
  config: AgoraModelConfig;
  requestedModel?: string;
}): string {
  const modelId = params.requestedModel?.trim() || params.config.secretaryModel;

  if (!params.config.allowedModels.includes(modelId)) {
    throw new ModelConfigError(`Model is not allowed by AGORA_ALLOWED_MODELS: ${modelId}`);
  }

  return modelId;
}

export function parseModelList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return dedupeModelList(value.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function dedupeModelList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeModelSource(value: string | undefined): ModelSource {
  if (!value) {
    return DEFAULT_MODEL_SOURCE;
  }

  if (value === 'openrouter') {
    return value;
  }

  throw new ModelConfigError(`Unsupported AGORA_MODEL_SOURCE: ${value}`);
}

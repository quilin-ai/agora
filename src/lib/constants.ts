export const MODEL_COLORS: Record<string, string> = {
  'anthropic/claude-sonnet-4.6': '#D97706',
  'openai/gpt-5.2': '#10A37F',
  'google/gemini-3.1-pro': '#4285F4',
  'deepseek/deepseek-chat': '#5B6AE0',
  'x-ai/grok-4.1': '#888888',
  // Free tier models
  'openai/gpt-oss-120b:free': '#10A37F',
  'qwen/qwen3-next-80b-a3b-instruct:free': '#FF6B35',
  'meta-llama/llama-3.3-70b-instruct:free': '#7B4EA6',
  'nousresearch/hermes-3-llama-3.1-405b:free': '#E84393',
  'google/gemma-3-27b-it:free': '#4285F4',
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'anthropic/claude-sonnet-4.6': 'Claude',
  'openai/gpt-5.2': 'GPT',
  'google/gemini-3.1-pro': 'Gemini',
  'deepseek/deepseek-chat': 'DeepSeek',
  'x-ai/grok-4.1': 'Grok',
  'openai/gpt-oss-120b:free': 'GPT',
  'qwen/qwen3-next-80b-a3b-instruct:free': 'Qwen',
  'meta-llama/llama-3.3-70b-instruct:free': 'Llama',
  'nousresearch/hermes-3-llama-3.1-405b:free': 'Hermes',
  'google/gemma-3-27b-it:free': 'Gemma',
};

export function getModelColor(modelId: string): string {
  return MODEL_COLORS[modelId] ?? '#6B7280';
}

export function getModelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId.split('/').pop()?.replace(/:.*$/, '') ?? modelId;
}

import type { CompletionRequest, OpenRouterClient, StreamChunk } from '@/lib/orchestrator/types';

interface OpenRouterErrorPayload {
  error?: {
    message?: string;
    code?: string;
  };
}

interface OpenRouterJsonResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface OpenRouterStreamResponse {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;

export function createOpenRouterClient(): OpenRouterClient {
  return {
    async *streamCompletion(request: CompletionRequest) {
      const response = await postChatCompletion({
        request,
        stream: true,
      });

      if (!response.body) {
        throw new Error('OpenRouter streaming response body is empty');
      }

      let fullText = '';
      let finishReason: string | null = null;
      let usage = {
        promptTokens: 0,
        completionTokens: 0,
      };

      for await (const rawEvent of readServerSentEvents(response.body)) {
        if (rawEvent === '[DONE]') {
          break;
        }

        const chunk = JSON.parse(rawEvent) as OpenRouterStreamResponse;
        const choice = chunk.choices?.[0];
        const text = normalizeMessageContent(choice?.delta?.content);

        if (text) {
          fullText += text;
          yield { text } satisfies StreamChunk;
        }

        finishReason = choice?.finish_reason ?? finishReason;

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? usage.promptTokens,
            completionTokens: chunk.usage.completion_tokens ?? usage.completionTokens,
          };
        }
      }

      return {
        text: fullText,
        usage,
        finishReason,
      };
    },
    async complete(request: CompletionRequest) {
      const response = await postChatCompletion({
        request,
        stream: false,
      });
      const payload = (await response.json()) as OpenRouterJsonResponse;
      const choice = payload.choices?.[0];

      return {
        text: normalizeMessageContent(choice?.message?.content),
        usage: {
          promptTokens: payload.usage?.prompt_tokens ?? 0,
          completionTokens: payload.usage?.completion_tokens ?? 0,
        },
        finishReason: choice?.finish_reason ?? null,
      };
    },
  };
}

async function postChatCompletion(params: {
  request: CompletionRequest;
  stream: boolean;
}): Promise<globalThis.Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const timeoutMs = params.request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new globalThis.AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await globalThis.fetch(
      `${process.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL}/chat/completions`,
      {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.OPENROUTER_HTTP_REFERER
          ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER }
          : {}),
        ...(process.env.OPENROUTER_APP_TITLE
          ? { 'X-Title': process.env.OPENROUTER_APP_TITLE }
          : {}),
      },
      body: JSON.stringify({
        model: params.request.model,
        messages: params.request.messages,
        temperature: params.request.temperature,
        response_format: params.request.responseFormat,
        stream: params.stream,
      }),
      signal: controller.signal,
      }
    );

    if (!response.ok) {
      let message = `OpenRouter request failed with status ${response.status}`;

      try {
        const payload = (await response.json()) as OpenRouterErrorPayload;
        if (payload.error?.message) {
          message = payload.error.message;
        }
      } catch {
        // Ignore JSON parsing failure and keep the status-based message.
      }

      throw new Error(message);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }

        return '';
      })
      .join('');
  }

  return '';
}

async function* readServerSentEvents(
  body: globalThis.ReadableStream<Uint8Array>
): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new globalThis.TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      yield* flushBuffer(buffer);
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const eventData = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();

      if (eventData) {
        yield eventData;
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}

async function* flushBuffer(buffer: string): AsyncGenerator<string, void, void> {
  const normalized = buffer.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return;
  }

  const eventData = normalized
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim();

  if (eventData) {
    yield eventData;
  }
}

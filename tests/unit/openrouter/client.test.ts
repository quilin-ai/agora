import { describe, expect, it } from 'vitest';

import {
  createOpenRouterClient,
  DEFAULT_OPENROUTER_BASE_URL,
  flushBuffer,
  normalizeMessageContent,
  readServerSentEvents,
} from '@/lib/openrouter/client';

function createEventStream(chunks: string[]): globalThis.ReadableStream<Uint8Array> {
  const encoder = new globalThis.TextEncoder();

  return new globalThis.ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('openrouter client', () => {
  it('parses non-streaming chat completions', async () => {
    const client = createOpenRouterClient({
      env: {
        OPENROUTER_API_KEY: 'test-key',
      },
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(`${DEFAULT_OPENROUTER_BASE_URL}/chat/completions`);
        expect(init?.method).toBe('POST');

        return new globalThis.Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: [{ text: 'hello world' }],
                },
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 34,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    const result = await client.complete({
      model: 'openai/gpt-5.2',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result).toEqual({
      text: 'hello world',
      usage: {
        promptTokens: 12,
        completionTokens: 34,
      },
      finishReason: 'stop',
    });
  });

  it('parses streaming chat completions and usage', async () => {
    const body = createEventStream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const client = createOpenRouterClient({
      env: {
        OPENROUTER_API_KEY: 'test-key',
        OPENROUTER_HTTP_REFERER: 'https://example.com',
        OPENROUTER_APP_TITLE: 'Agora Tests',
      },
      fetchImpl: async (_input, init) => {
        const headers = new globalThis.Headers(init?.headers);
        expect(headers.get('HTTP-Referer')).toBe('https://example.com');
        expect(headers.get('X-Title')).toBe('Agora Tests');

        return new globalThis.Response(body, { status: 200 });
      },
    });

    const stream = client.streamCompletion({
      model: 'openai/gpt-5.2',
      messages: [{ role: 'user', content: 'hello' }],
    });

    const chunks: string[] = [];
    while (true) {
      const next = await stream.next();
      if (next.done) {
        expect(next.value).toEqual({
          text: 'Hello',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
          },
          finishReason: 'stop',
        });
        break;
      }

      chunks.push(next.value.text);
    }

    expect(chunks).toEqual(['Hel', 'lo']);
  });

  it('surfaces API error payload messages', async () => {
    const client = createOpenRouterClient({
      env: {
        OPENROUTER_API_KEY: 'test-key',
      },
      fetchImpl: async () =>
        new globalThis.Response(
          JSON.stringify({
            error: {
              message: 'provider unavailable',
            },
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }
        ),
    });

    await expect(
      client.complete({
        model: 'openai/gpt-5.2',
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).rejects.toThrow('provider unavailable');
  });

  it('exports stream parsing helpers', async () => {
    expect(normalizeMessageContent([{ text: 'ab' }, 'cd'])).toBe('abcd');

    const stream = createEventStream([
      'data: {"chunk":1}\n\n',
      'data: {"chunk":2}\n\n',
    ]);

    const events: string[] = [];
    for await (const event of readServerSentEvents(stream)) {
      events.push(event);
    }

    const flushed: string[] = [];
    for await (const event of flushBuffer('data: {"tail":1}\n')) {
      flushed.push(event);
    }

    expect(events).toEqual(['{"chunk":1}', '{"chunk":2}']);
    expect(flushed).toEqual(['{"tail":1}']);
  });
});

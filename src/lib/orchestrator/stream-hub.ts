import type {
  BillingCost,
  DiscussionStatus,
  DiscussionSummaryFinal,
  ModelFailureRecord,
  SSEEvent,
} from '@/lib/types';
import { toDoneEventData, toRestoreEventData } from '@/lib/types';
import { rawCostForTokens } from '@/lib/billing';
import { sseEventSchema } from '@/lib/types/schemas';

import type {
  CompletionRequest,
  OpenRouterClient,
  RoundModelResponse,
  StreamHub,
} from './types';

export const ROUND_RULES = {
  MODEL_TIMEOUT_MS: 45_000,
  MODEL_TTFT_TIMEOUT_MS: 15_000,
  MIN_MODELS_PER_ROUND: 2,
  MAX_RETRIES_PER_MODEL: 1,
  RETRY_WITH_DEGRADED: true,
} as const;

export interface ModelPricingTable {
  [modelId: string]: {
    input: number;
    output: number;
  };
}

export interface StreamWithRetryResult {
  response: RoundModelResponse | null;
  failures: ModelFailureRecord[];
}

function emitValidatedEvent(onEvent: (event: SSEEvent) => void, event: SSEEvent): void {
  onEvent(sseEventSchema.parse(event));
}

export function createStreamHub(onEvent: (event: SSEEvent) => void): StreamHub {
  let seq = 0;

  function nextSeq(): number {
    seq += 1;
    return seq;
  }

  return {
    emit(event) {
      emitValidatedEvent(onEvent, event);
    },
    progress(discussionId: string, round: number, phase: string) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'progress',
        data: { round, total_rounds: 3, phase, seq: nextSeq() },
      });
    },
    chunk(params) {
      void params.discussionId;
      emitValidatedEvent(onEvent, {
        type: 'chunk',
        data: {
          logical_model_id: params.logicalModelId,
          actual_model_id: params.actualModelId,
          round: params.round,
          content: params.text,
          done: params.done ?? false,
          seq: nextSeq(),
        },
      });
    },
    modelDone(params) {
      void params.discussionId;
      emitValidatedEvent(onEvent, {
        type: 'model_done',
        data: {
          logical_model_id: params.logicalModelId,
          actual_model_id: params.actualModelId,
          round: params.round,
          tokens: {
            input: params.inputTokens,
            output: params.outputTokens,
          },
          seq: nextSeq(),
        },
      });
    },
    modelError(params) {
      void params.discussionId;
      emitValidatedEvent(onEvent, {
        type: 'model_error',
        data: {
          logical_model_id: params.logicalModelId,
          actual_model_id: params.actualModelId,
          round: params.round,
          error_type: params.errorType,
          action: params.action,
          degraded_to: params.degradedTo ?? null,
          message: params.message,
          seq: nextSeq(),
        },
      });
    },
    roundDone(params) {
      void params.discussionId;
      emitValidatedEvent(onEvent, {
        type: 'round_done',
        data: {
          round: params.round,
          completed_models: params.completedModels,
          skipped_models: params.skippedModels,
          failed_models: params.failedModels,
          total_models: params.totalModels,
          seq: nextSeq(),
        },
      });
    },
    roundSummary(
      discussionId: string,
      round: number,
      nextRound: number | null,
      summary: DiscussionSummaryFinal
    ) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'round_summary',
        data: {
          round,
          next_round: nextRound,
          ...summary,
          seq: nextSeq(),
        },
      });
    },
    anonymize(discussionId: string, round: number, labels: string[]) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'anonymize',
        data: { round, labels, seq: nextSeq() },
      });
    },
    summary(discussionId: string, summary: DiscussionSummaryFinal) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'summary',
        data: {
          ...summary,
          seq: nextSeq(),
        },
      });
    },
    done(discussionId: string, billing: BillingCost) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'done',
        data: toDoneEventData(billing, nextSeq()),
      });
    },
    restore(
      discussionId: string,
      status: DiscussionStatus,
      currentRound: number,
      lastCompletedRound: number
    ) {
      emitValidatedEvent(onEvent, {
        type: 'restore',
        data: toRestoreEventData({
          status,
          currentRound,
          lastCompletedRound,
        }),
      });
      void discussionId;
    },
    error(discussionId: string, errorMessage: string) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'error',
        data: {
          code: 'ORCHESTRATOR_ERROR',
          message: errorMessage,
        },
      });
    },
    interruptAck(discussionId: string) {
      void discussionId;
      emitValidatedEvent(onEvent, {
        type: 'interrupt_ack',
        data: {
          status: 'acknowledged',
          message: 'Interrupt accepted for the next round.',
          seq: nextSeq(),
        },
      });
    },
  };
}

export async function streamWithRetry(params: {
  discussionId: string;
  logicalModelId: string;
  round: number;
  prompt: string;
  client: OpenRouterClient;
  hub: StreamHub;
  fallbackModelIds?: string[];
  pricingData?: ModelPricingTable | null;
}): Promise<StreamWithRetryResult> {
  const failures: ModelFailureRecord[] = [];
  let latestErrorType: string | undefined;

  const emitFailure = (failure: ModelFailureRecord, message: string, degradedTo?: string | null) => {
    failures.push(failure);
    params.hub.modelError({
      discussionId: params.discussionId,
      logicalModelId: params.logicalModelId,
      actualModelId: failure.actual_model_id,
      round: params.round,
      errorType: failure.error_type,
      action: failure.action,
      degradedTo: degradedTo ?? null,
      message,
    });
  };

  try {
    const response = await streamSingle({
      discussionId: params.discussionId,
      logicalModelId: params.logicalModelId,
      actualModelId: params.logicalModelId,
      round: params.round,
      prompt: params.prompt,
      client: params.client,
      hub: params.hub,
      pricingData: params.pricingData,
    });

    return { response, failures };
  } catch (error) {
    latestErrorType = inferErrorType(error);
    const retryMessage = createFailureMessage({
      action: 'retrying',
      errorType: latestErrorType ?? 'server_error',
      logicalModelId: params.logicalModelId,
      actualModelId: params.logicalModelId,
    });

    emitFailure(
      {
        logical_model_id: params.logicalModelId,
        actual_model_id: params.logicalModelId,
        error_type: latestErrorType ?? 'server_error',
        action: 'retrying',
      },
      retryMessage
    );
  }

  for (let attempt = 0; attempt < ROUND_RULES.MAX_RETRIES_PER_MODEL; attempt += 1) {
    try {
      const response = await streamSingle({
        discussionId: params.discussionId,
        logicalModelId: params.logicalModelId,
        actualModelId: params.logicalModelId,
        round: params.round,
        prompt: params.prompt,
        client: params.client,
        hub: params.hub,
        pricingData: params.pricingData,
      });

      return { response, failures };
    } catch (error) {
      latestErrorType = inferErrorType(error);
    }
  }

  if (ROUND_RULES.RETRY_WITH_DEGRADED) {
    const degradedModelId = params.fallbackModelIds?.find(
      (candidate) => candidate !== params.logicalModelId
    );

    if (degradedModelId) {
      const degradedMessage = createFailureMessage({
        action: 'degraded',
        errorType: latestErrorType ?? 'server_error',
        logicalModelId: params.logicalModelId,
        actualModelId: degradedModelId,
      });

      emitFailure(
          {
            logical_model_id: params.logicalModelId,
            actual_model_id: degradedModelId,
            error_type: latestErrorType ?? 'server_error',
            action: 'degraded',
          },
          degradedMessage,
        degradedModelId
      );

      try {
        const response = await streamSingle({
          discussionId: params.discussionId,
          logicalModelId: params.logicalModelId,
          actualModelId: degradedModelId,
          round: params.round,
          prompt: params.prompt,
          client: params.client,
          hub: params.hub,
          pricingData: params.pricingData,
        });

        return { response, failures };
      } catch (error) {
        latestErrorType = inferErrorType(error);
        const skipMessage = createFailureMessage({
          action: 'skipped',
          errorType: latestErrorType ?? 'server_error',
          logicalModelId: params.logicalModelId,
          actualModelId: degradedModelId,
        });

        emitFailure(
          {
            logical_model_id: params.logicalModelId,
            actual_model_id: degradedModelId,
            error_type: latestErrorType ?? 'server_error',
            action: 'skipped',
          },
          skipMessage
        );

        return { response: null, failures };
      }
    }
  }

  const skipMessage = createFailureMessage({
    action: 'skipped',
    errorType: latestErrorType ?? 'server_error',
    logicalModelId: params.logicalModelId,
    actualModelId: params.logicalModelId,
  });

  emitFailure(
    {
      logical_model_id: params.logicalModelId,
      actual_model_id: params.logicalModelId,
      error_type: latestErrorType ?? 'server_error',
      action: 'skipped',
    },
    skipMessage
  );

  return { response: null, failures };
}

async function streamSingle(params: {
  discussionId: string;
  logicalModelId: string;
  actualModelId: string;
  round: number;
  prompt: string;
  client: OpenRouterClient;
  hub: StreamHub;
  pricingData?: ModelPricingTable | null;
}): Promise<RoundModelResponse> {
  const controller = new globalThis.AbortController();
  const startedAt = Date.now();
  const request: CompletionRequest = {
    model: params.actualModelId,
    timeoutMs: ROUND_RULES.MODEL_TIMEOUT_MS,
    signal: controller.signal,
    messages: [
      {
        role: 'system',
        content: params.prompt,
      },
    ],
  };
  const generator = params.client.streamCompletion(request);
  let fullText = '';
  let ttftMs: number | null = null;

  try {
    while (true) {
      const nextPromise = generator.next();
      nextPromise.catch(() => undefined);

      const next = await (ttftMs === null
        ? withTimeout(nextPromise, ROUND_RULES.MODEL_TTFT_TIMEOUT_MS, () => {
            controller.abort(`Model TTFT timed out after ${ROUND_RULES.MODEL_TTFT_TIMEOUT_MS}ms`);
          })
        : nextPromise);

      if (next.done) {
        const result = next.value;
        const latencyMs = Date.now() - startedAt;
        const resolvedTtftMs = ttftMs ?? latencyMs;
        const rawCost = rawCostForTokens({
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          pricing: params.pricingData?.[params.actualModelId],
        });

        params.hub.modelDone({
          discussionId: params.discussionId,
          logicalModelId: params.logicalModelId,
          actualModelId: params.actualModelId,
          round: params.round,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
        });

        return {
          modelId: params.logicalModelId,
          actualModelId: params.actualModelId,
          round: params.round,
          text: fullText,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          rawCost,
          ttftMs: resolvedTtftMs,
          latencyMs,
        };
      }

      if (!next.value.text) {
        continue;
      }

      if (ttftMs === null) {
        ttftMs = Date.now() - startedAt;
      }

      fullText += next.value.text;
      params.hub.chunk({
        discussionId: params.discussionId,
        logicalModelId: params.logicalModelId,
        actualModelId: params.actualModelId,
        round: params.round,
        text: next.value.text,
      });
    }
  } finally {
    await closeGenerator(generator);
  }
}

async function closeGenerator(
  generator: AsyncGenerator<{ text: string }, unknown, void>
): Promise<void> {
  try {
    await generator.return?.(undefined);
  } catch {
    // Ignore cleanup failures after the stream has already errored.
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          onTimeout();
          reject(new Error(`Model TTFT timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function inferErrorType(error: unknown): string {
  const normalized =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (normalized.includes('ttft') || normalized.includes('timeout')) {
    return 'timeout';
  }

  if (normalized.includes('rate')) {
    return 'rate_limited';
  }

  if (normalized.includes('interrupt') || normalized.includes('abort')) {
    return 'stream_interrupted';
  }

  if (normalized.includes('filter')) {
    return 'output_filtered';
  }

  return 'server_error';
}

function createFailureMessage(params: {
  action: 'retrying' | 'degraded' | 'skipped';
  errorType: string;
  logicalModelId: string;
  actualModelId: string;
}): string {
  const prefix = describeErrorType(params.errorType);

  if (params.action === 'retrying') {
    return `${prefix} Retrying ${params.logicalModelId}.`;
  }

  if (params.action === 'degraded') {
    return `${prefix} Degraded ${params.logicalModelId} to ${params.actualModelId}.`;
  }

  return `${prefix} Skipping ${params.logicalModelId} for this round.`;
}

function describeErrorType(errorType: string): string {
  switch (errorType) {
    case 'timeout':
      return 'Model timed out.';
    case 'rate_limited':
      return 'Model was rate limited.';
    case 'stream_interrupted':
      return 'Stream was interrupted.';
    case 'output_filtered':
      return 'Output was filtered.';
    default:
      return 'Model request failed.';
  }
}

import type { BillingCost, DiscussionStatus, DiscussionSummaryFinal, SSEEvent } from '@/lib/types';
import { toDoneEventData, toRestoreEventData } from '@/lib/types';
import { sseEventSchema } from '@/lib/types/schemas';

import type { StreamHub } from './types';

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
    restore(discussionId: string, status: DiscussionStatus, lastCompletedRound: number) {
      emitValidatedEvent(onEvent, {
        type: 'restore',
        data: toRestoreEventData({
          status,
          currentRound: lastCompletedRound,
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

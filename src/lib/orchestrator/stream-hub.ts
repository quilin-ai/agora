import type { BillingCost, DiscussionStatus, DiscussionSummaryFinal, SSEEvent } from '@/lib/types';
import { sseEventSchema } from '@/lib/types/schemas';

import type { StreamHub } from './types';

function emitValidatedEvent(onEvent: (event: SSEEvent) => void, event: SSEEvent): void {
  onEvent(sseEventSchema.parse(event));
}

export function createStreamHub(onEvent: (event: SSEEvent) => void): StreamHub {
  return {
    emit(event) {
      emitValidatedEvent(onEvent, event);
    },
    progress(discussionId: string, round: number, phase: string) {
      emitValidatedEvent(onEvent, {
        type: 'progress',
        data: { discussion_id: discussionId, round, phase },
      });
    },
    chunk(discussionId: string, modelId: string, text: string) {
      emitValidatedEvent(onEvent, {
        type: 'chunk',
        data: { discussion_id: discussionId, model_id: modelId, text },
      });
    },
    modelDone(discussionId: string, modelId: string, tokens: number) {
      emitValidatedEvent(onEvent, {
        type: 'model_done',
        data: { discussion_id: discussionId, model_id: modelId, tokens },
      });
    },
    modelError(discussionId: string, modelId: string, errorMessage: string) {
      emitValidatedEvent(onEvent, {
        type: 'model_error',
        data: { discussion_id: discussionId, model_id: modelId, error_message: errorMessage },
      });
    },
    roundDone(discussionId: string, round: number) {
      emitValidatedEvent(onEvent, {
        type: 'round_done',
        data: { discussion_id: discussionId, round },
      });
    },
    anonymize(discussionId: string, labels: string[]) {
      emitValidatedEvent(onEvent, {
        type: 'anonymize',
        data: { discussion_id: discussionId, labels },
      });
    },
    summary(discussionId: string, summary: DiscussionSummaryFinal) {
      emitValidatedEvent(onEvent, {
        type: 'summary',
        data: { discussion_id: discussionId, summary },
      });
    },
    done(discussionId: string, billing: BillingCost) {
      emitValidatedEvent(onEvent, {
        type: 'done',
        data: { discussion_id: discussionId, billing },
      });
    },
    restore(discussionId: string, status: DiscussionStatus, lastCompletedRound: number) {
      emitValidatedEvent(onEvent, {
        type: 'restore',
        data: { discussion_id: discussionId, status, last_completed_round: lastCompletedRound },
      });
    },
    error(discussionId: string, errorMessage: string) {
      emitValidatedEvent(onEvent, {
        type: 'error',
        data: { discussion_id: discussionId, error_message: errorMessage },
      });
    },
    interruptAck(discussionId: string) {
      emitValidatedEvent(onEvent, {
        type: 'interrupt_ack',
        data: { discussion_id: discussionId },
      });
    },
  };
}

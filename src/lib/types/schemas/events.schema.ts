import { z } from 'zod';

import { messageSchema } from './discussion.schema';
import { discussionSummaryFinalSchema } from './secretary.schema';

export const sseEventTypeSchema = z.enum([
  'progress',
  'chunk',
  'model_done',
  'model_error',
  'round_done',
  'anonymize',
  'summary',
  'done',
  'restore',
  'error',
  'interrupt_ack',
]);

export const progressEventSchema = z
  .object({
    type: z.literal('progress'),
    data: z
      .object({
        round: z.number(),
        total_rounds: z.number(),
        phase: z.string(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const chunkEventSchema = z
  .object({
    type: z.literal('chunk'),
    data: z
      .object({
        logical_model_id: z.string(),
        actual_model_id: z.string(),
        round: z.number(),
        content: z.string(),
        done: z.boolean(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const modelDoneEventSchema = z
  .object({
    type: z.literal('model_done'),
    data: z
      .object({
        logical_model_id: z.string(),
        actual_model_id: z.string(),
        round: z.number(),
        tokens: z
          .object({
            input: z.number(),
            output: z.number(),
          })
          .strict(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const modelErrorEventSchema = z
  .object({
    type: z.literal('model_error'),
    data: z
      .object({
        logical_model_id: z.string(),
        actual_model_id: z.string().nullable(),
        round: z.number(),
        error_type: z.string(),
        action: z.enum(['skipped', 'retrying', 'degraded']),
        degraded_to: z.string().nullable(),
        message: z.string(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const roundDoneEventSchema = z
  .object({
    type: z.literal('round_done'),
    data: z
      .object({
        round: z.number(),
        completed_models: z.array(z.string()),
        skipped_models: z.array(z.string()),
        failed_models: z.array(
          z
            .object({
              logical_model_id: z.string(),
              actual_model_id: z.string().nullable(),
              error_type: z.string(),
              action: z.enum(['retrying', 'degraded', 'skipped']),
            })
            .strict()
        ),
        total_models: z.number(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const anonymizeEventSchema = z
  .object({
    type: z.literal('anonymize'),
    data: z
      .object({
        round: z.number(),
        labels: z.array(z.string()),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const summaryEventSchema = z
  .object({
    type: z.literal('summary'),
    data: discussionSummaryFinalSchema.extend({
      seq: z.number(),
    }).strict(),
  })
  .strict();

export const doneEventSchema = z
  .object({
    type: z.literal('done'),
    data: z
      .object({
        total_raw_cost: z.number(),
        total_platform_price: z.number(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const restoreEventSchema = z
  .object({
    type: z.literal('restore'),
    data: z
      .object({
        resume_mode: z.literal('state_restore'),
        can_stream: z.boolean(),
        current_status: z.enum([
          'created',
          'streaming',
          'summarizing',
          'completed',
          'failed',
          'aborted',
        ]),
        current_round: z.number(),
        last_completed_round: z.number(),
        completed_round_messages: z.array(messageSchema),
        summary: discussionSummaryFinalSchema.nullable(),
        error_code: z.string().optional(),
        error_message: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const errorEventSchema = z
  .object({
    type: z.literal('error'),
    data: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const interruptAckEventSchema = z
  .object({
    type: z.literal('interrupt_ack'),
    data: z
      .object({
        status: z.literal('acknowledged'),
        message: z.string(),
        seq: z.number(),
      })
      .strict(),
  })
  .strict();

export const sseEventSchema = z.discriminatedUnion('type', [
  progressEventSchema,
  chunkEventSchema,
  modelDoneEventSchema,
  modelErrorEventSchema,
  roundDoneEventSchema,
  anonymizeEventSchema,
  summaryEventSchema,
  doneEventSchema,
  restoreEventSchema,
  errorEventSchema,
  interruptAckEventSchema,
]);

import { z } from 'zod';

import { billingCostSchema } from './billing.schema';
import { discussionStatusSchema } from './discussion.schema';
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

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const progressEventSchema = z
  .object({
    type: z.literal('progress'),
    data: z
      .object({
        discussion_id: z.string(),
        round: z.number(),
        phase: z.string(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const chunkEventSchema = z
  .object({
    type: z.literal('chunk'),
    data: z
      .object({
        discussion_id: z.string(),
        model_id: z.string(),
        text: z.string(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const modelDoneEventSchema = z
  .object({
    type: z.literal('model_done'),
    data: z
      .object({
        discussion_id: z.string(),
        model_id: z.string(),
        tokens: z.number(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const modelErrorEventSchema = z
  .object({
    type: z.literal('model_error'),
    data: z
      .object({
        discussion_id: z.string(),
        model_id: z.string(),
        error_message: z.string(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const roundDoneEventSchema = z
  .object({
    type: z.literal('round_done'),
    data: z
      .object({
        discussion_id: z.string(),
        round: z.number(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const anonymizeEventSchema = z
  .object({
    type: z.literal('anonymize'),
    data: z
      .object({
        discussion_id: z.string(),
        labels: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const summaryEventSchema = z
  .object({
    type: z.literal('summary'),
    data: z
      .object({
        discussion_id: z.string(),
        summary: discussionSummaryFinalSchema,
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const doneEventSchema = z
  .object({
    type: z.literal('done'),
    data: z
      .object({
        discussion_id: z.string(),
        billing: billingCostSchema,
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const restoreEventSchema = z
  .object({
    type: z.literal('restore'),
    data: z
      .object({
        discussion_id: z.string(),
        status: discussionStatusSchema,
        last_completed_round: z.number(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const errorEventSchema = z
  .object({
    type: z.literal('error'),
    data: z
      .object({
        discussion_id: z.string(),
        error_message: z.string(),
      })
      .strict(),
  })
  .strict();

// GAP: payload 结构待确认 — 以下 payload 基于 CLI 渲染建议推导，非冻结协议
export const interruptAckEventSchema = z
  .object({
    type: z.literal('interrupt_ack'),
    data: z
      .object({
        discussion_id: z.string(),
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

import { z } from 'zod';

export const createDiscussionRequestSchema = z
  .object({
    topic: z.string().min(1),
    models: z.array(z.string()).optional(),
    mode: z.literal('consensus').optional(),
    max_rounds: z.literal(3).optional(),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const createDiscussionResponseSchema = z
  .object({
    id: z.string(),
    status: z.literal('created'),
    estimated_raw_cost: z.number(),
    held_platform_amount: z.number(),
    stream_url: z.string(),
  })
  .strict();

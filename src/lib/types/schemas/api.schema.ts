import { z } from 'zod';

import { discussionStatusSchema } from './discussion.schema';

export const createDiscussionRequestSchema = z
  .object({
    topic: z.string().min(1),
    model_ids: z.array(z.string()).min(2),
    conversation_id: z.string().uuid().optional(),
  })
  .strict();

export const createDiscussionResponseSchema = z
  .object({
    discussion_id: z.string(),
    conversation_id: z.string(),
    status: discussionStatusSchema,
  })
  .strict();

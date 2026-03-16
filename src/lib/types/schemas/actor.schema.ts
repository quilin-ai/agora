import { z } from 'zod';

export const actorContextSchema = z
  .object({
    userId: z.string().min(1),
    source: z.enum(['cli', 'web', 'test']),
  })
  .strict();

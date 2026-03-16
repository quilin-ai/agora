import { z } from 'zod';

export const secretaryRawOutputSchema = z
  .object({
    consensus: z.string(),
    disagreements: z.array(z.string()),
    recommendation: z.string(),
    confidence: z.number().min(0).max(1),
    open_questions: z.array(z.string()),
    decision_boundary: z.string().optional(),
    evidence_refs: z.array(z.string()),
  })
  .strict();

export const discussionSummaryFinalSchema = z
  .object({
    raw_output: secretaryRawOutputSchema,
    generated_at: z.string(),
    secretary_model: z.string(),
    token_usage: z
      .object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
      })
      .strict(),
  })
  .strict();

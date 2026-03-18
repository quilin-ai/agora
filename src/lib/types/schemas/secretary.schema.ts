import { z } from 'zod';

export const consensusPointSchema = z
  .object({
    content: z.string().min(1),
    supporting_models: z.array(z.string()),
    evidence_refs: z.array(z.string()).default([]),
  })
  .strict();

export const disagreementPositionSchema = z
  .object({
    model_id: z.string(),
    stance: z.enum(['for', 'against', 'neutral']),
    summary: z.string().min(1),
  })
  .strict();

export const disagreementPointSchema = z
  .object({
    topic: z.string().min(1),
    type: z.enum([
      'fact_conflict',
      'context_gap',
      'logic_divergence',
      'preference_difference',
    ]),
    positions: z.array(disagreementPositionSchema).min(2),
    severity: z.enum(['high', 'medium', 'low']),
  })
  .strict();

export const secretaryRawOutputSchema = z
  .object({
    consensus: z.array(consensusPointSchema).min(1).max(5),
    disagreements: z.array(disagreementPointSchema),
    recommendation: z.string().min(10),
    confidence: z.enum(['high', 'medium', 'low']),
    open_questions: z.array(z.string()).default([]),
    decision_boundary: z.string().optional(),
    evidence_refs: z.array(z.string()).default([]),
  })
  .strict();

export const discussionSummaryFinalSchema = z
  .object({
    consensus: z.array(consensusPointSchema).min(1).max(5),
    disagreements: z.array(disagreementPointSchema),
    recommendation: z.string().min(10),
    confidence: z.enum(['high', 'medium', 'low']),
    open_questions: z.array(z.string()),
    decision_boundary: z.string().optional(),
    evidence_refs: z.array(z.string()),
    disclaimer: z.string().min(1),
    is_degraded: z.boolean(),
  })
  .strict();

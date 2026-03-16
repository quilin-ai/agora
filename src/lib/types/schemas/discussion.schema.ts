import { z } from 'zod';

export const discussionStatusSchema = z.enum([
  'created',
  'streaming',
  'summarizing',
  'completed',
  'failed',
  'aborted',
]);

export const conversationStatusSchema = discussionStatusSchema;

export const terminalStatusSchema = z.enum(['completed', 'failed', 'aborted']);
export const conversationTypeSchema = z.enum(['chat', 'council']);
export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export const roundTypeSchema = z.enum(['independent', 'review', 'rebuttal']);
export const roundNumberSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const roundStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export const executionStatusSchema = z.enum(['running', 'completed', 'failed']);

export const discussionTransitionSchema = z.union([
  z.object({ from: z.literal('created'), to: z.literal('streaming') }).strict(),
  z.object({ from: z.literal('created'), to: z.literal('aborted') }).strict(),
  z.object({ from: z.literal('created'), to: z.literal('failed') }).strict(),
  z.object({ from: z.literal('streaming'), to: z.literal('streaming') }).strict(),
  z.object({ from: z.literal('streaming'), to: z.literal('summarizing') }).strict(),
  z.object({ from: z.literal('streaming'), to: z.literal('failed') }).strict(),
  z.object({ from: z.literal('streaming'), to: z.literal('aborted') }).strict(),
  z.object({ from: z.literal('summarizing'), to: z.literal('completed') }).strict(),
  z.object({ from: z.literal('summarizing'), to: z.literal('failed') }).strict(),
]);

export const messageSchema = z
  .object({
    id: z.string(),
    conversation_id: z.string(),
    role: messageRoleSchema,
    logical_model_id: z.string().nullable().optional(),
    actual_model_id: z.string().nullable().optional(),
    round: z.number().nullable().optional(),
    anonymous_label: z.string().nullable().optional(),
    content: z.string(),
    status: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .strict();

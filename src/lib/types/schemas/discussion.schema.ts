import { z } from 'zod';

export const discussionStatusSchema = z.enum([
  'created',
  'streaming',
  'summarizing',
  'completed',
  'failed',
  'aborted',
]);

export const terminalStatusSchema = z.enum(['completed', 'failed', 'aborted']);

export const roundTypeSchema = z.enum(['independent', 'review', 'rebuttal']);

export const roundNumberSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const roundStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
]);

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

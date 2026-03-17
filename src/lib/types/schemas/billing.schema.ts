import { z } from 'zod';

export const creditTransactionTypeSchema = z.enum([
  'hold',
  'settle',
  'release',
  'refund',
  'grant',
  'purchase',
  'monthly_reset',
]);

export const billingCostSchema = z
  .object({
    raw_cost: z.number(),
    platform_price: z.number(),
  })
  .strict();

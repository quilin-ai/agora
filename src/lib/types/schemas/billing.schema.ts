import { z } from 'zod';

export const creditTransactionTypeSchema = z.enum([
  'hold',
  'release',
  'refund',
  'settle',
]);

export const billingCostSchema = z
  .object({
    raw_cost: z.number(),
    platform_price: z.number(),
  })
  .strict();

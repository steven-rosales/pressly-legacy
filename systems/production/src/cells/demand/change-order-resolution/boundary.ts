import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionIdSchema,
  productionOrderResolutionReasonSchema,
  productionOrderResolutionStateSchema,
  productionOrderRestorationReasonSchema,
} from '../../../read-models/production-order/contract.ts';

export const productionOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
  })
  .strict();

const productionOrderResolutionNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .nullable()
  .default(null);

const requireResolutionOtherNote = (
  value: Readonly<{ reason: string; note: string | null }>,
  context: z.RefinementCtx,
): void => {
  if (value.reason === 'other' && value.note === null)
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'An explanatory note is required for the other reason.',
    });
};

export const changeProductionOrderResolutionRequestSchema =
  z.discriminatedUnion('action', [
    z
      .object({
        action: z.literal('resolve_without_production'),
        reason: productionOrderResolutionReasonSchema,
        note: productionOrderResolutionNoteSchema,
        confirmReviewedFacts: z.boolean().default(false),
        expectedVersion: z.number().int().positive(),
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict()
      .superRefine(requireResolutionOtherNote),
    z
      .object({
        action: z.literal('restore'),
        reason: productionOrderRestorationReasonSchema,
        note: productionOrderResolutionNoteSchema,
        expectedVersion: z.number().int().positive(),
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict()
      .superRefine(requireResolutionOtherNote),
  ]);

export const changeProductionOrderResolutionResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    action: z.enum(['resolve_without_production', 'restore']),
    resolutionState: productionOrderResolutionStateSchema,
    transitionedAt: utcIsoStringSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export type ChangeProductionOrderResolutionRequest = z.infer<
  typeof changeProductionOrderResolutionRequestSchema
>;
export type ChangeProductionOrderResolutionCommand =
  ChangeProductionOrderResolutionRequest &
    Readonly<{ locationId: string; orderId: string }>;
export type ChangeProductionOrderResolutionResult = z.infer<
  typeof changeProductionOrderResolutionResultSchema
>;

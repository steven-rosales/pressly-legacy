import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionHashSchema,
  productionIdSchema,
  productionPlacementFailureReasonSchema,
  productionPlacementModeSchema,
  productionPlacementTargetSchema,
} from '../production-order/contract.ts';

const productionQueueCommandFields = {
  locationId: z.string().min(1),
  productionRunId: productionIdSchema,
  expectedQueueVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

export const productionRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();
export const placeProductionOrderAutomaticallyCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
  })
  .strict();

export const placeProductionOrderAutomaticallyRequestSchema =
  placeProductionOrderAutomaticallyCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
  });

export const placeProductionOrderExactlyCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
    productionBatchId: productionIdSchema,
    expectedBatchVersion: z.number().int().positive(),
  })
  .strict();

export const placeProductionOrderExactlyRequestSchema =
  placeProductionOrderExactlyCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
    productionBatchId: true,
  });

export const confirmProductionOrderOvertimeCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
    proposalHash: productionHashSchema,
  })
  .strict();

export const confirmProductionOrderOvertimeRequestSchema =
  confirmProductionOrderOvertimeCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
  });

const productionPlacementCommittedFields = {
  status: z.literal('placed'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  productionBatchId: productionIdSchema,
  createdBatch: z.boolean(),
  affectedBatchIds: z.array(productionIdSchema).min(1),
  queueVersion: z.number().int().positive(),
  proposalHash: productionHashSchema,
  plannedCompletionAt: utcIsoStringSchema,
  overtimeMinutes: z.number().int().nonnegative(),
  replayed: z.boolean(),
} as const;

export const productionOrderPlacedResultSchema = z
  .object(productionPlacementCommittedFields)
  .strict();

const productionPlacementConfirmationFields = {
  status: z.literal('confirmation_required'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  target: productionPlacementTargetSchema,
  affectedBatchIds: z.array(productionIdSchema),
  queueVersion: z.number().int().positive(),
  proposalHash: productionHashSchema,
  projectedCompletionAt: utcIsoStringSchema,
  overtimeMinutes: z.number().int().positive(),
  replayed: z.literal(false),
} as const;

export const productionOrderPlacementConfirmationRequiredResultSchema = z
  .object(productionPlacementConfirmationFields)
  .strict();

const productionPlacementNotPlacedFields = {
  status: z.literal('not_placed'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  reason: productionPlacementFailureReasonSchema,
  message: z.string().min(1),
  queueVersion: z.number().int().positive(),
  replayed: z.boolean(),
} as const;

export const productionOrderNotPlacedResultSchema = z
  .object(productionPlacementNotPlacedFields)
  .strict();

export const productionOrderPlacementResultSchema = z.discriminatedUnion(
  'status',
  [
    productionOrderPlacedResultSchema,
    productionOrderPlacementConfirmationRequiredResultSchema,
    productionOrderNotPlacedResultSchema,
  ],
);

export const automaticProductionOrderPlacementResultSchema =
  z.discriminatedUnion('status', [
    z
      .object({
        ...productionPlacementCommittedFields,
        mode: z.literal('automatic'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementConfirmationFields,
        mode: z.literal('automatic'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementNotPlacedFields,
        mode: z.literal('automatic'),
      })
      .strict(),
  ]);

export const exactProductionOrderPlacementResultSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        ...productionPlacementCommittedFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementConfirmationFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementNotPlacedFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
  ],
);

export const confirmProductionOrderOvertimeResultSchema = z.discriminatedUnion(
  'status',
  [productionOrderPlacedResultSchema, productionOrderNotPlacedResultSchema],
);

export type PlaceProductionOrderAutomaticallyCommand = z.infer<
  typeof placeProductionOrderAutomaticallyCommandSchema
>;
export type PlaceProductionOrderExactlyCommand = z.infer<
  typeof placeProductionOrderExactlyCommandSchema
>;
export type ConfirmProductionOrderOvertimeCommand = z.infer<
  typeof confirmProductionOrderOvertimeCommandSchema
>;
export type ProductionOrderPlacementResult = z.infer<
  typeof productionOrderPlacementResultSchema
>;
export type AutomaticProductionOrderPlacementResult = z.infer<
  typeof automaticProductionOrderPlacementResultSchema
>;
export type ExactProductionOrderPlacementResult = z.infer<
  typeof exactProductionOrderPlacementResultSchema
>;
export type ConfirmProductionOrderOvertimeResult = z.infer<
  typeof confirmProductionOrderOvertimeResultSchema
>;

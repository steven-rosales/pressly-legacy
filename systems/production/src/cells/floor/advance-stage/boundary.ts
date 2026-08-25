import { z } from 'zod';

import {
  productionStageCompletionTimingSchema,
  productionStageStartTimingSchema,
  productionStageTimingConfirmationSchema,
} from '../../../read-models/production-board/contract.ts';
import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
export const stageCommandSchema = z
  .object({
    locationId: z.string().min(1),
    stageRunId: productionIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const stageRequestSchema = stageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const startStageCommandSchema = stageCommandSchema
  .extend({
    confirmation: productionStageTimingConfirmationSchema.optional(),
  })
  .strict();

export const startStageRequestSchema = startStageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const completeStageCommandSchema = stageCommandSchema
  .extend({
    confirmation: productionStageTimingConfirmationSchema.optional(),
  })
  .strict();

export const completeStageRequestSchema = completeStageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const productionMutationResultSchema = z
  .object({
    entityId: productionIdSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const productionStageCompletionConfirmationRequiredResultSchema = z
  .object({
    status: z.literal('confirmation_required'),
    stageRunId: productionIdSchema,
    stageVersion: z.number().int().positive(),
    code: z.literal('PULSE_BOUNDARY_NOT_REACHED'),
    message: z.string().min(1),
    confirmation: productionStageTimingConfirmationSchema,
    timing: productionStageCompletionTimingSchema,
    replayed: z.literal(false),
  })
  .strict();

export const productionStageStartConfirmationRequiredResultSchema = z
  .object({
    status: z.literal('confirmation_required'),
    stageRunId: productionIdSchema,
    stageVersion: z.number().int().positive(),
    code: z.literal('PLANNED_START_NOT_REACHED'),
    message: z.string().min(1),
    confirmation: productionStageTimingConfirmationSchema,
    timing: productionStageStartTimingSchema,
    replayed: z.literal(false),
  })
  .strict();

export const advanceProductionStageResultSchema = z.union([
  productionMutationResultSchema,
  productionStageStartConfirmationRequiredResultSchema,
  productionStageCompletionConfirmationRequiredResultSchema,
]);

export const productionStageParamsSchema = z
  .object({
    locationId: z.string().min(1),
    stageRunId: productionIdSchema,
  })
  .strict();

export type StartStageCommand = z.infer<typeof startStageCommandSchema>;
export type CompleteStageCommand = z.infer<typeof completeStageCommandSchema>;
export type ProductionStageStartConfirmationRequiredResult = z.infer<
  typeof productionStageStartConfirmationRequiredResultSchema
>;
export type ProductionStageCompletionConfirmationRequiredResult = z.infer<
  typeof productionStageCompletionConfirmationRequiredResultSchema
>;
export type AdvanceProductionStageResult = z.infer<
  typeof advanceProductionStageResultSchema
>;

import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionAlgorithmVersionSchema,
  productionHashSchema,
  productionIdSchema,
  productionStageKindSchema,
  productionWarningCodeSchema,
  productionWarningSchema,
} from '../production-order/contract.ts';
export const productionShiftSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    status: z.enum(['draft', 'open', 'closed']),
    version: z.number().int().positive(),
  })
  .strict();

export const productionShiftSelectionSchema = z
  .object({
    productionShiftId: productionIdSchema,
    version: z.number().int().nonnegative(),
    selectedOrderIds: z.array(productionIdSchema),
  })
  .strict()
  .superRefine((selection, context) => {
    if (
      new Set(selection.selectedOrderIds).size !==
      selection.selectedOrderIds.length
    )
      context.addIssue({
        code: 'custom',
        path: ['selectedOrderIds'],
        message: 'Selected order IDs must be unique.',
      });
  });

export const schedulerConfigSchema = z
  .object({
    id: productionIdSchema,
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    algorithmVersion: productionAlgorithmVersionSchema,
    version: z.number().int().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
        assertedBy: productionIdSchema,
        assertedAt: utcIsoStringSchema,
      })
      .strict(),
    publishedAt: utcIsoStringSchema,
  })
  .strict();

export const plannedStageSchema = z
  .object({
    stage: productionStageKindSchema,
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    machineIds: z.array(productionIdSchema),
  })
  .strict();

export const proposedBatchSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    orderIds: z.array(productionIdSchema).min(1),
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative(),
    stages: z.array(plannedStageSchema).length(4),
  })
  .strict();

export const scheduleProposalSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    status: z.enum(['draft', 'accepted', 'superseded', 'rejected']),
    inputSnapshotHash: productionHashSchema,
    outputPlanHash: productionHashSchema,
    algorithmVersion: productionAlgorithmVersionSchema,
    pulseMinutes: z.number().int().positive(),
    pulseCapacityLbs: z.number().positive(),
    batchCount: z.number().int().nonnegative(),
    makespanMinutes: z.number().int().nonnegative(),
    plannedCompletionAt: utcIsoStringSchema,
    batches: z.array(proposedBatchSchema),
    unplacedOrderIds: z.array(productionIdSchema),
    warnings: z.array(productionWarningSchema),
    createdAt: utcIsoStringSchema,
    acceptedAt: utcIsoStringSchema.nullable(),
    acceptedBy: productionIdSchema.nullable(),
    acknowledgedWarningCodes: z.array(productionWarningCodeSchema),
    supersededAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export type ProductionShift = z.infer<typeof productionShiftSchema>;
export type ProductionShiftSelection = z.infer<
  typeof productionShiftSelectionSchema
>;
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;
export type ScheduleProposal = z.infer<typeof scheduleProposalSchema>;

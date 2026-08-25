import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
const serviceDayPattern = /^\d{4}-\d{2}-\d{2}$/;

const isRealServiceDay = (value: string): boolean => {
  if (!serviceDayPattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined)
    return false;
  const instant = new Date(Date.UTC(year, month - 1, day));
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() + 1 === month &&
    instant.getUTCDate() === day
  );
};

export const productionServiceDaySchema = z
  .string()
  .regex(serviceDayPattern)
  .refine(isRealServiceDay, 'Service day must be a real Gregorian date.');

export const productionRemainingDayForecastParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();

export const productionRemainingDayForecastQuerySchema = z
  .object({ serviceDay: productionServiceDaySchema })
  .strict();

export const productionForecastActionabilitySchema = z.discriminatedUnion(
  'action',
  [
    z
      .object({
        action: z.literal('monitor'),
        state: z.literal('informational'),
        reason: z.enum([
          'already_in_production',
          'awaiting_source_release',
          'missing_estimate',
        ]),
      })
      .strict(),
    z
      .object({
        action: z.literal('open_production'),
        state: z.literal('available'),
        reason: z.literal('already_in_production'),
      })
      .strict(),
    z
      .object({
        action: z.literal('record_intake'),
        state: z.literal('available'),
        reason: z.literal('physical_intake_required'),
      })
      .strict(),
    z
      .object({
        action: z.literal('release_to_production'),
        state: z.literal('available'),
        reason: z.literal('manual_release_available'),
      })
      .strict(),
    z
      .object({
        action: z.literal('place_in_active_run'),
        state: z.literal('available'),
        reason: z.literal('ready_for_placement'),
      })
      .strict(),
    z
      .object({
        action: z.literal('review_placement'),
        state: z.literal('available'),
        reason: z.literal('overtime_confirmation_required'),
      })
      .strict(),
    z
      .object({
        action: z.literal('plan_shift'),
        state: z.literal('available'),
        reason: z.enum([
          'no_active_run',
          'ambiguous_active_run',
          'placement_rejected',
        ]),
      })
      .strict(),
  ],
);

const productionForecastOrderIdentitySchema = z
  .object({
    orderDemandId: productionIdSchema,
    externalOrderId: z.string().min(1),
    dueAt: utcIsoStringSchema,
    priority: z.boolean(),
    estimatedWeightLbs: z.number().positive().nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const productionForecastInProductionItemSchema =
  productionForecastOrderIdentitySchema
    .extend({
      productionOrderId: productionIdSchema,
      activeRunId: productionIdSchema,
      activeBatchId: productionIdSchema,
      actionability: productionForecastActionabilitySchema,
    })
    .strict();

export const productionForecastReadyToPlaceItemSchema =
  productionForecastOrderIdentitySchema
    .extend({
      productionOrderId: productionIdSchema,
      activeRunId: productionIdSchema,
      actionability: productionForecastActionabilitySchema,
    })
    .strict();

export const productionForecastExpectedLaterItemSchema =
  productionForecastOrderIdentitySchema
    .extend({
      productionOrderId: productionIdSchema.nullable(),
      readiness: z.enum([
        'awaiting_release',
        'awaiting_intake',
        'not_admitted',
      ]),
      actionability: productionForecastActionabilitySchema,
    })
    .strict();

export const productionForecastNeedsShiftItemSchema =
  productionForecastOrderIdentitySchema
    .extend({
      productionOrderId: productionIdSchema,
      activeRunId: productionIdSchema.nullable(),
      reason: z.enum([
        'no_active_run',
        'ambiguous_active_run',
        'placement_rejected',
        'current_run_window_exceeded',
      ]),
      actionability: productionForecastActionabilitySchema,
    })
    .strict();

export const productionForecastGroupSummarySchema = z
  .object({
    orderCount: z.number().int().nonnegative(),
    knownWeightLbs: z.number().nonnegative(),
    missingEstimateOrderCount: z.number().int().nonnegative(),
  })
  .strict();

export const productionRemainingDayForecastSchema = z
  .object({
    locationId: z.string().min(1),
    serviceDay: productionServiceDaySchema,
    timezone: z.string().min(1),
    window: z
      .object({
        startsAt: utcIsoStringSchema,
        endsAt: utcIsoStringSchema,
      })
      .strict(),
    asOf: utcIsoStringSchema,
    assumptions: z
      .object({
        algorithmVersion: z.literal('online-stable-insertion-v1'),
        overdueUnfinishedIncluded: z.literal(true),
        physicalIntakeRequired: z.literal(true),
        wholeOrderPlacement: z.literal(true),
        expectedWeightsAdvisory: z.literal(true),
        missingEstimatesExcludedFromWeightTotals: z.literal(true),
        placementRevalidatedOnCommit: z.literal(true),
        preciseFinishForecasted: z.literal(false),
      })
      .strict(),
    shifts: z.array(
      z
        .object({
          productionShiftId: productionIdSchema,
          startsAt: utcIsoStringSchema,
          endsAt: utcIsoStringSchema,
          status: z.enum(['draft', 'open', 'closed']),
          activeRunId: productionIdSchema.nullable(),
        })
        .strict(),
    ),
    totals: z
      .object({
        all: productionForecastGroupSummarySchema,
        inProduction: productionForecastGroupSummarySchema,
        readyToPlace: productionForecastGroupSummarySchema,
        expectedLater: productionForecastGroupSummarySchema,
        needsShift: productionForecastGroupSummarySchema,
      })
      .strict(),
    capacityRisk: z
      .object({
        level: z.enum(['clear', 'attention', 'unknown']),
        reasons: z.array(
          z.enum([
            'all_ready_work_appendable',
            'needs_shift',
            'expected_later',
            'missing_estimates',
            'no_active_run',
            'ambiguous_active_run',
            'no_ready_work',
          ]),
        ),
        pulseCapacityLbs: z.number().positive().nullable(),
      })
      .strict(),
    groups: z
      .object({
        inProduction: z.array(productionForecastInProductionItemSchema),
        readyToPlace: z.array(productionForecastReadyToPlaceItemSchema),
        expectedLater: z.array(productionForecastExpectedLaterItemSchema),
        needsShift: z.array(productionForecastNeedsShiftItemSchema),
      })
      .strict(),
  })
  .strict();

export type ProductionRemainingDayForecast = z.infer<
  typeof productionRemainingDayForecastSchema
>;
export type ProductionForecastInProductionItem = z.infer<
  typeof productionForecastInProductionItemSchema
>;
export type ProductionForecastReadyToPlaceItem = z.infer<
  typeof productionForecastReadyToPlaceItemSchema
>;
export type ProductionForecastExpectedLaterItem = z.infer<
  typeof productionForecastExpectedLaterItemSchema
>;
export type ProductionForecastNeedsShiftItem = z.infer<
  typeof productionForecastNeedsShiftItemSchema
>;

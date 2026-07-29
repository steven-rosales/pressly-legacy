import { z } from 'zod';
import {
  productionBatchOrderSchema,
  productionBatchSchema,
  productionBoardSchema,
  productionLiveRunChangeOrderSchema,
  productionLiveRunChangesSchema,
  productionOrderListItemSchema,
  productionOrderSummarySchema,
  productionPendingOrderSchema,
  productionWorkspaceSchema,
} from '../production/production.contracts.ts';
import {
  productionForecastExpectedLaterItemSchema,
  productionForecastInProductionItemSchema,
  productionForecastNeedsShiftItemSchema,
  productionForecastReadyToPlaceItemSchema,
  productionRemainingDayForecastSchema,
} from '../production/production-forecast.contracts.ts';
import {
  listProductionHistoryActivityResultSchema,
  productionHistoryActivityEntrySchema,
  productionHistoryOrderMembershipSchema,
  productionHistoryRunDetailSchema,
} from '../production/production-history.contracts.ts';
import {
  productionOrderBacklogPreviewItemSchema,
  productionOrderBacklogPreviewSchema,
} from '../production/production-order-backlog.contracts.ts';

export const processorOperationalOrderIdentitySchema = z
  .object({
    displayNumber: z.string().min(1),
    customerDisplayName: z.string().min(1).nullable(),
  })
  .strict();

export const processorProductionOrderSummarySchema =
  productionOrderSummarySchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionOrderListItemSchema =
  productionOrderListItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionPendingOrderSchema =
  productionPendingOrderSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionLiveRunChangeOrderSchema =
  productionLiveRunChangeOrderSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionLiveRunChangesSchema =
  productionLiveRunChangesSchema
    .extend({
      orders: z.array(processorProductionLiveRunChangeOrderSchema),
    })
    .strict();

export const processorProductionBatchOrderSchema = productionBatchOrderSchema
  .safeExtend({ identity: processorOperationalOrderIdentitySchema })
  .strict();

export const processorProductionBatchSchema = productionBatchSchema
  .safeExtend({
    orders: z.array(processorProductionBatchOrderSchema).min(1),
  })
  .strict();

export const processorProductionBoardSchema = productionBoardSchema
  .extend({
    batches: z.array(processorProductionBatchSchema),
  })
  .strict();

export const processorProductionWorkspaceSchema = productionWorkspaceSchema
  .extend({
    orders: z.array(processorProductionOrderListItemSchema),
    pendingEligibleOrders: z.array(processorProductionPendingOrderSchema),
    liveRunChanges: processorProductionLiveRunChangesSchema.nullable(),
    board: processorProductionBoardSchema.nullable(),
  })
  .strict();

export const processorForecastInProductionItemSchema =
  productionForecastInProductionItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorForecastReadyToPlaceItemSchema =
  productionForecastReadyToPlaceItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorForecastExpectedLaterItemSchema =
  productionForecastExpectedLaterItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorForecastNeedsShiftItemSchema =
  productionForecastNeedsShiftItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorRemainingDayForecastSchema =
  productionRemainingDayForecastSchema
    .extend({
      groups: z
        .object({
          inProduction: z.array(processorForecastInProductionItemSchema),
          readyToPlace: z.array(processorForecastReadyToPlaceItemSchema),
          expectedLater: z.array(processorForecastExpectedLaterItemSchema),
          needsShift: z.array(processorForecastNeedsShiftItemSchema),
        })
        .strict(),
    })
    .strict();

export const processorProductionHistoryOrderMembershipSchema =
  productionHistoryOrderMembershipSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionHistoryRunDetailSchema =
  productionHistoryRunDetailSchema
    .extend({
      orderMemberships: z.array(
        processorProductionHistoryOrderMembershipSchema,
      ),
    })
    .strict();

export const processorProductionHistoryActivityEntrySchema =
  productionHistoryActivityEntrySchema
    .safeExtend({
      identity: processorOperationalOrderIdentitySchema.nullable(),
    })
    .superRefine((entry, context) => {
      const requiresIdentity = entry.entityType === 'production_order';
      if (requiresIdentity !== (entry.identity !== null))
        context.addIssue({
          code: 'custom',
          path: ['identity'],
          message:
            'Only Production order activity entries must carry operational order identity.',
        });
    });

export const processorListProductionHistoryActivityResultSchema =
  listProductionHistoryActivityResultSchema
    .extend({
      items: z.array(processorProductionHistoryActivityEntrySchema),
    })
    .strict();

export const processorProductionOrderBacklogPreviewItemSchema =
  productionOrderBacklogPreviewItemSchema
    .extend({ identity: processorOperationalOrderIdentitySchema })
    .strict();

export const processorProductionOrderBacklogPreviewSchema =
  productionOrderBacklogPreviewSchema
    .safeExtend({
      groups: z
        .object({
          readyToArchive: z.array(
            processorProductionOrderBacklogPreviewItemSchema,
          ),
          reviewIndividually: z.array(
            processorProductionOrderBacklogPreviewItemSchema,
          ),
          keptForSafety: z.array(
            processorProductionOrderBacklogPreviewItemSchema,
          ),
          alreadyHistorical: z.array(
            processorProductionOrderBacklogPreviewItemSchema,
          ),
        })
        .strict(),
    })
    .strict();

export type ProcessorOperationalOrderIdentity = z.infer<
  typeof processorOperationalOrderIdentitySchema
>;
export type ProcessorProductionOrderSummary = z.infer<
  typeof processorProductionOrderSummarySchema
>;
export type ProcessorProductionOrderListItem = z.infer<
  typeof processorProductionOrderListItemSchema
>;
export type ProcessorProductionPendingOrder = z.infer<
  typeof processorProductionPendingOrderSchema
>;
export type ProcessorProductionLiveRunChangeOrder = z.infer<
  typeof processorProductionLiveRunChangeOrderSchema
>;
export type ProcessorProductionLiveRunChanges = z.infer<
  typeof processorProductionLiveRunChangesSchema
>;
export type ProcessorProductionBatchOrder = z.infer<
  typeof processorProductionBatchOrderSchema
>;
export type ProcessorProductionBatch = z.infer<
  typeof processorProductionBatchSchema
>;
export type ProcessorProductionBoard = z.infer<
  typeof processorProductionBoardSchema
>;
export type ProcessorProductionWorkspace = z.infer<
  typeof processorProductionWorkspaceSchema
>;
export type ProcessorForecastInProductionItem = z.infer<
  typeof processorForecastInProductionItemSchema
>;
export type ProcessorForecastReadyToPlaceItem = z.infer<
  typeof processorForecastReadyToPlaceItemSchema
>;
export type ProcessorForecastExpectedLaterItem = z.infer<
  typeof processorForecastExpectedLaterItemSchema
>;
export type ProcessorForecastNeedsShiftItem = z.infer<
  typeof processorForecastNeedsShiftItemSchema
>;
export type ProcessorRemainingDayForecast = z.infer<
  typeof processorRemainingDayForecastSchema
>;
export type ProcessorProductionHistoryOrderMembership = z.infer<
  typeof processorProductionHistoryOrderMembershipSchema
>;
export type ProcessorProductionHistoryRunDetail = z.infer<
  typeof processorProductionHistoryRunDetailSchema
>;
export type ProcessorProductionHistoryActivityEntry = z.infer<
  typeof processorProductionHistoryActivityEntrySchema
>;
export type ProcessorListProductionHistoryActivityResult = z.infer<
  typeof processorListProductionHistoryActivityResultSchema
>;
export type ProcessorProductionOrderBacklogPreviewItem = z.infer<
  typeof processorProductionOrderBacklogPreviewItemSchema
>;
export type ProcessorProductionOrderBacklogPreview = z.infer<
  typeof processorProductionOrderBacklogPreviewSchema
>;

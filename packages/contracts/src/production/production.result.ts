import type { z } from 'zod';
import type {
  acceptScheduleResultSchema,
  advanceProductionStageResultSchema,
  automaticProductionOrderPlacementResultSchema,
  confirmProductionOrderOvertimeResultSchema,
  exactProductionOrderPlacementResultSchema,
  listProductionLocationsResultSchema,
  listProductionOrdersResultSchema,
  productionBootstrapDestructiveRejectionSchema,
  productionBootstrapResourceChangeSchema,
  productionBootstrapResultSchema,
  productionBatchSchema,
  productionFloorMilestoneSchema,
  productionFloorProgressReasonSchema,
  productionFloorProgressTargetSchema,
  productionBatchMembershipMutationResultSchema,
  productionBatchMembershipSchema,
  productionBatchProgressReconciliationConfirmationRequiredResultSchema,
  productionBatchProgressReconciliationResultSchema,
  productionBatchProgressReconciledResultSchema,
  productionBatchOrderSchema,
  productionBoardSchema,
  productionLocationSchema,
  productionDemandForecastSchema,
  productionDemandOutlookItemSchema,
  productionDemandOutlookSchema,
  productionMachineSchema,
  productionMutationResultSchema,
  productionOrderListItemSchema,
  productionPendingOrderSchema,
  productionPendingPlacementSchema,
  productionPlacementPreviewSchema,
  productionOrderSummarySchema,
  productionOrderPlacementResultSchema,
  productionOvertimeAcknowledgementSchema,
  productionPlacementTargetSchema,
  productionRunSummarySchema,
  productionShiftSchema,
  productionShiftSelectionSchema,
  productionStageActionBlockCodeSchema,
  productionStageCompletionConfirmationRequiredResultSchema,
  productionStageCompletionTimingSchema,
  productionStageStartConfirmationRequiredResultSchema,
  productionStageStartTimingSchema,
  productionStageNextActionSchema,
  productionStationSchema,
  productionWarningSchema,
  productionWorkspaceSchema,
  proposedBatchSchema,
  recordOrderIntakeResultSchema,
  replaceProductionShiftSelectionResultSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
  startScheduleResultSchema,
  stageRunSchema,
  updateProductionShiftResultSchema,
} from './production.contracts.ts';

export type ProductionWarning = z.infer<typeof productionWarningSchema>;
export type ProductionDemandOutlookItem = z.infer<
  typeof productionDemandOutlookItemSchema
>;
export type ProductionDemandForecast = z.infer<
  typeof productionDemandForecastSchema
>;
export type ProductionDemandOutlook = z.infer<
  typeof productionDemandOutlookSchema
>;
export type ProductionOrderSummary = z.infer<
  typeof productionOrderSummarySchema
>;
export type ProductionPendingOrder = z.infer<
  typeof productionPendingOrderSchema
>;
export type ProductionPendingPlacement = z.infer<
  typeof productionPendingPlacementSchema
>;
export type ProductionPlacementPreview = z.infer<
  typeof productionPlacementPreviewSchema
>;
export type ProductionMachine = z.infer<typeof productionMachineSchema>;
export type ProductionShift = z.infer<typeof productionShiftSchema>;
export type ProductionShiftSelection = z.infer<
  typeof productionShiftSelectionSchema
>;
export type ReplaceProductionShiftSelectionResult = z.infer<
  typeof replaceProductionShiftSelectionResultSchema
>;
export type UpdateProductionShiftResult = z.infer<
  typeof updateProductionShiftResultSchema
>;
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;
export type ProposedBatch = z.infer<typeof proposedBatchSchema>;
export type ScheduleProposal = z.infer<typeof scheduleProposalSchema>;
export type StageRun = z.infer<typeof stageRunSchema>;
export type ProductionStageActionBlockCode = z.infer<
  typeof productionStageActionBlockCodeSchema
>;
export type ProductionStageCompletionTiming = z.infer<
  typeof productionStageCompletionTimingSchema
>;
export type ProductionStageCompletionConfirmationRequiredResult = z.infer<
  typeof productionStageCompletionConfirmationRequiredResultSchema
>;
export type ProductionStageStartTiming = z.infer<
  typeof productionStageStartTimingSchema
>;
export type ProductionStageStartConfirmationRequiredResult = z.infer<
  typeof productionStageStartConfirmationRequiredResultSchema
>;
export type AdvanceProductionStageResult = z.infer<
  typeof advanceProductionStageResultSchema
>;
export type ProductionStageNextAction = z.infer<
  typeof productionStageNextActionSchema
>;
export type ProductionBatch = z.infer<typeof productionBatchSchema>;
export type ProductionFloorMilestone = z.infer<
  typeof productionFloorMilestoneSchema
>;
export type ProductionFloorProgressTarget = z.infer<
  typeof productionFloorProgressTargetSchema
>;
export type ProductionFloorProgressReason = z.infer<
  typeof productionFloorProgressReasonSchema
>;
export type ProductionBatchOrder = z.infer<typeof productionBatchOrderSchema>;
export type ProductionBatchMembership = z.infer<
  typeof productionBatchMembershipSchema
>;
export type ProductionBoard = z.infer<typeof productionBoardSchema>;
export type ProductionMutationResult = z.infer<
  typeof productionMutationResultSchema
>;
export type AcceptScheduleResult = z.infer<typeof acceptScheduleResultSchema>;
export type StartScheduleResult = z.infer<typeof startScheduleResultSchema>;
export type ProductionBatchMembershipMutationResult = z.infer<
  typeof productionBatchMembershipMutationResultSchema
>;
export type ProductionBatchProgressReconciliationConfirmationRequiredResult =
  z.infer<
    typeof productionBatchProgressReconciliationConfirmationRequiredResultSchema
  >;
export type ProductionBatchProgressReconciledResult = z.infer<
  typeof productionBatchProgressReconciledResultSchema
>;
export type ProductionBatchProgressReconciliationResult = z.infer<
  typeof productionBatchProgressReconciliationResultSchema
>;
export type ProductionPlacementTarget = z.infer<
  typeof productionPlacementTargetSchema
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
export type ProductionOvertimeAcknowledgement = z.infer<
  typeof productionOvertimeAcknowledgementSchema
>;
export type ProductionOrderListItem = z.infer<
  typeof productionOrderListItemSchema
>;
export type ProductionLocation = z.infer<typeof productionLocationSchema>;
export type ProductionStation = z.infer<typeof productionStationSchema>;
export type ProductionRunSummary = z.infer<typeof productionRunSummarySchema>;
export type ProductionWorkspace = z.infer<typeof productionWorkspaceSchema>;
export type ListProductionLocationsResult = z.infer<
  typeof listProductionLocationsResultSchema
>;
export type ListProductionOrdersResult = z.infer<
  typeof listProductionOrdersResultSchema
>;
export type RecordOrderIntakeResult = z.infer<
  typeof recordOrderIntakeResultSchema
>;
export type ProductionBootstrapResourceChange = z.infer<
  typeof productionBootstrapResourceChangeSchema
>;
export type ProductionBootstrapDestructiveRejection = z.infer<
  typeof productionBootstrapDestructiveRejectionSchema
>;
export type ProductionBootstrapResult = z.infer<
  typeof productionBootstrapResultSchema
>;

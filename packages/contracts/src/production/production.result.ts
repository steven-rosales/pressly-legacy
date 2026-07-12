import type { z } from 'zod';
import type {
  acceptScheduleResultSchema,
  listProductionLocationsResultSchema,
  listProductionOrdersResultSchema,
  productionBootstrapDestructiveRejectionSchema,
  productionBootstrapResourceChangeSchema,
  productionBootstrapResultSchema,
  productionBatchSchema,
  productionBoardSchema,
  productionLocationSchema,
  productionMachineSchema,
  productionMutationResultSchema,
  productionOrderListItemSchema,
  productionOrderSummarySchema,
  productionRunSummarySchema,
  productionShiftSchema,
  productionStationSchema,
  productionWarningSchema,
  productionWorkspaceSchema,
  proposedBatchSchema,
  recordOrderIntakeResultSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
  stageRunSchema,
} from './production.contracts.ts';

export type ProductionWarning = z.infer<typeof productionWarningSchema>;
export type ProductionOrderSummary = z.infer<
  typeof productionOrderSummarySchema
>;
export type ProductionMachine = z.infer<typeof productionMachineSchema>;
export type ProductionShift = z.infer<typeof productionShiftSchema>;
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;
export type ProposedBatch = z.infer<typeof proposedBatchSchema>;
export type ScheduleProposal = z.infer<typeof scheduleProposalSchema>;
export type StageRun = z.infer<typeof stageRunSchema>;
export type ProductionBatch = z.infer<typeof productionBatchSchema>;
export type ProductionBoard = z.infer<typeof productionBoardSchema>;
export type ProductionMutationResult = z.infer<
  typeof productionMutationResultSchema
>;
export type AcceptScheduleResult = z.infer<typeof acceptScheduleResultSchema>;
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

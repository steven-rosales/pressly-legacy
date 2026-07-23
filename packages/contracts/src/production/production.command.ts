import type { z } from 'zod';
import type {
  acceptScheduleCommandSchema,
  assignStageMachinesCommandSchema,
  completeStageCommandSchema,
  confirmProductionOrderOvertimeCommandSchema,
  createProductionShiftCommandSchema,
  createScheduleCommandSchema,
  freezeProductionBatchCommandSchema,
  listProductionLocationsQuerySchema,
  listProductionOrdersQuerySchema,
  productionBootstrapInputSchema,
  productionBootstrapManifestSchema,
  placeProductionOrderAutomaticallyCommandSchema,
  placeProductionOrderExactlyCommandSchema,
  productionRunBoardParamsSchema,
  productionLocationResourceInputSchema,
  productionMachineResourceInputSchema,
  productionRunCommandSchema,
  productionStationResourceInputSchema,
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
  publishSchedulerConfigCommandSchema,
  changeProductionAdmissionCommandSchema,
  recordOrderIntakeCommandSchema,
  reconcileProductionBatchProgressCommandSchema,
  replaceProductionShiftSelectionCommandSchema,
  scheduleRunParamsSchema,
  schedulerConfigResourceInputSchema,
  setProductionOrderPriorityCommandSchema,
  startScheduleCommandSchema,
  stageCommandSchema,
  startStageCommandSchema,
  unfreezeProductionBatchCommandSchema,
  updateProductionShiftCommandSchema,
} from './production.contracts.ts';

export type PublishSchedulerConfigCommand = z.infer<
  typeof publishSchedulerConfigCommandSchema
>;
export type CreateProductionShiftCommand = z.infer<
  typeof createProductionShiftCommandSchema
>;
export type UpdateProductionShiftCommand = z.infer<
  typeof updateProductionShiftCommandSchema
>;
export type SetProductionOrderPriorityCommand = z.infer<
  typeof setProductionOrderPriorityCommandSchema
>;
export type CreateScheduleCommand = z.infer<typeof createScheduleCommandSchema>;
export type ScheduleRunParams = z.infer<typeof scheduleRunParamsSchema>;
export type AcceptScheduleCommand = z.infer<typeof acceptScheduleCommandSchema>;
export type StartScheduleCommand = z.infer<typeof startScheduleCommandSchema>;
export type ProductionRunBoardParams = z.infer<
  typeof productionRunBoardParamsSchema
>;
/** @deprecated Use ProductionRunBoardParams. */
export type ProductionBoardParams = ProductionRunBoardParams;
export type ProductionRunCommand = z.infer<typeof productionRunCommandSchema>;
export type StageCommand = z.infer<typeof stageCommandSchema>;
export type StartStageCommand = z.infer<typeof startStageCommandSchema>;
export type CompleteStageCommand = z.infer<typeof completeStageCommandSchema>;
export type AssignStageMachinesCommand = z.infer<
  typeof assignStageMachinesCommandSchema
>;
export type ListProductionLocationsQuery = z.infer<
  typeof listProductionLocationsQuerySchema
>;
export type ListProductionOrdersQuery = z.infer<
  typeof listProductionOrdersQuerySchema
>;
export type ProductionWorkspaceParams = z.infer<
  typeof productionWorkspaceParamsSchema
>;
export type ProductionWorkspaceQuery = z.infer<
  typeof productionWorkspaceQuerySchema
>;
export type FreezeProductionBatchCommand = z.infer<
  typeof freezeProductionBatchCommandSchema
>;
export type UnfreezeProductionBatchCommand = z.infer<
  typeof unfreezeProductionBatchCommandSchema
>;
export type PlaceProductionOrderAutomaticallyCommand = z.infer<
  typeof placeProductionOrderAutomaticallyCommandSchema
>;
export type PlaceProductionOrderExactlyCommand = z.infer<
  typeof placeProductionOrderExactlyCommandSchema
>;
export type ConfirmProductionOrderOvertimeCommand = z.infer<
  typeof confirmProductionOrderOvertimeCommandSchema
>;
export type RecordOrderIntakeCommand = z.infer<
  typeof recordOrderIntakeCommandSchema
>;
export type ChangeProductionAdmissionCommand = z.infer<
  typeof changeProductionAdmissionCommandSchema
>;
export type ReplaceProductionShiftSelectionCommand = z.infer<
  typeof replaceProductionShiftSelectionCommandSchema
>;
export type ReconcileProductionBatchProgressCommand = z.infer<
  typeof reconcileProductionBatchProgressCommandSchema
>;
export type ProductionLocationResourceInput = z.infer<
  typeof productionLocationResourceInputSchema
>;
export type ProductionStationResourceInput = z.infer<
  typeof productionStationResourceInputSchema
>;
export type ProductionMachineResourceInput = z.infer<
  typeof productionMachineResourceInputSchema
>;
export type SchedulerConfigResourceInput = z.infer<
  typeof schedulerConfigResourceInputSchema
>;
export type ProductionBootstrapManifest = z.infer<
  typeof productionBootstrapManifestSchema
>;
export type ProductionBootstrapInput = z.infer<
  typeof productionBootstrapInputSchema
>;

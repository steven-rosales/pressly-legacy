import type { z } from 'zod';
import type {
  acceptScheduleCommandSchema,
  assignStageMachinesCommandSchema,
  createProductionShiftCommandSchema,
  createScheduleCommandSchema,
  listProductionLocationsQuerySchema,
  listProductionOrdersQuerySchema,
  productionBootstrapInputSchema,
  productionBootstrapManifestSchema,
  productionBoardParamsSchema,
  productionLocationResourceInputSchema,
  productionMachineResourceInputSchema,
  productionRunCommandSchema,
  productionStationResourceInputSchema,
  productionWorkspaceParamsSchema,
  publishSchedulerConfigCommandSchema,
  recordOrderIntakeCommandSchema,
  scheduleRunParamsSchema,
  schedulerConfigResourceInputSchema,
  setProductionOrderPriorityCommandSchema,
  stageCommandSchema,
} from './production.contracts.ts';

export type PublishSchedulerConfigCommand = z.infer<
  typeof publishSchedulerConfigCommandSchema
>;
export type CreateProductionShiftCommand = z.infer<
  typeof createProductionShiftCommandSchema
>;
export type SetProductionOrderPriorityCommand = z.infer<
  typeof setProductionOrderPriorityCommandSchema
>;
export type CreateScheduleCommand = z.infer<typeof createScheduleCommandSchema>;
export type ScheduleRunParams = z.infer<typeof scheduleRunParamsSchema>;
export type AcceptScheduleCommand = z.infer<typeof acceptScheduleCommandSchema>;
export type ProductionBoardParams = z.infer<typeof productionBoardParamsSchema>;
export type ProductionRunCommand = z.infer<typeof productionRunCommandSchema>;
export type StageCommand = z.infer<typeof stageCommandSchema>;
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
export type RecordOrderIntakeCommand = z.infer<
  typeof recordOrderIntakeCommandSchema
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

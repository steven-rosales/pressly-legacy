export { defineProductionRules, productionRules } from './rules.ts';
export type { ProductionRules } from './rules.ts';

export {
  allowedProductionBatchEvents,
  evaluateProductionBatchTransition,
  initialProductionBatchState,
  productionBatchGraph,
  productionBatchLifecycleStates,
} from './lifecycles/batch.ts';
export type {
  ProductionBatchLifecycleDecision,
  ProductionBatchLifecycleEvent,
  ProductionBatchLifecycleRejection,
  ProductionBatchLifecycleState,
} from './lifecycles/batch.ts';

export {
  allowedProductionOrderExecutionEvents,
  evaluateProductionOrderExecutionTransition,
  initialProductionOrderExecutionState,
  productionOrderExecutionGraph,
  productionOrderExecutionStates,
  resolveProductionOrderExecutionState,
} from './lifecycles/order-execution.ts';
export type {
  ProductionOrderExecutionEvent,
  ProductionOrderExecutionLifecycleDecision,
  ProductionOrderExecutionRejection,
  ProductionOrderExecutionState,
} from './lifecycles/order-execution.ts';

export { deriveProductionOrderOperationalStatus } from './lifecycles/order-operational-status.ts';
export type {
  ProductionOrderAdmissionFact,
  ProductionOrderOperationalStatus,
  ProductionOrderOperationalStatusInput,
} from './lifecycles/order-operational-status.ts';

export {
  allowedProductionOrderResolutionEvents,
  evaluateProductionOrderOperationalAccess,
  evaluateProductionOrderResolutionGuard,
  evaluateProductionOrderResolutionTransition,
  initialProductionOrderResolutionState,
  productionOrderResolutionBlockReasons,
  productionOrderResolutionGraph,
  productionOrderResolutionReviewReasons,
  productionOrderResolutionStates,
} from './lifecycles/order-resolution.ts';
export type {
  ProductionOrderOperationalAccessRejection,
  ProductionOrderResolutionBlockReason,
  ProductionOrderResolutionEvent,
  ProductionOrderResolutionGuardDecision,
  ProductionOrderResolutionGuardInput,
  ProductionOrderResolutionLifecycleDecision,
  ProductionOrderResolutionRejection,
  ProductionOrderResolutionReviewReason,
  ProductionOrderResolutionState,
} from './lifecycles/order-resolution.ts';

export {
  allowedProductionOrderStageAttemptEvents,
  evaluateProductionOrderStageAttemptTransition,
  initialProductionOrderStageAttemptState,
  productionOrderStageAttemptGraph,
  productionOrderStageAttemptStates,
} from './lifecycles/order-stage-attempt.ts';
export type {
  ProductionOrderStageAttemptEvent,
  ProductionOrderStageAttemptLifecycleDecision,
  ProductionOrderStageAttemptRejection,
  ProductionOrderStageAttemptState,
} from './lifecycles/order-stage-attempt.ts';

export {
  allowedProductionRunEvents,
  evaluateProductionRunTransition,
  initialProductionRunState,
  productionRunGraph,
} from './lifecycles/run.ts';
export type {
  ProductionRunLifecycleDecision,
  ProductionRunLifecycleEvent,
  ProductionRunLifecycleRejection,
  ProductionRunLifecycleState,
} from './lifecycles/run.ts';

export {
  allowedProductionShiftEvents,
  evaluateProductionShiftTransition,
  initialProductionShiftState,
  productionShiftGraph,
} from './lifecycles/shift.ts';
export type {
  ProductionShiftLifecycleDecision,
  ProductionShiftLifecycleEvent,
  ProductionShiftLifecycleRejection,
  ProductionShiftLifecycleState,
} from './lifecycles/shift.ts';

export {
  allowedScheduleRevisionEvents,
  evaluateScheduleRevisionTransition,
  initialScheduleRevisionState,
  scheduleRevisionGraph,
} from './lifecycles/schedule-revision.ts';
export type {
  ScheduleRevisionLifecycleDecision,
  ScheduleRevisionLifecycleEvent,
  ScheduleRevisionLifecycleRejection,
  ScheduleRevisionLifecycleState,
} from './lifecycles/schedule-revision.ts';

export {
  allowedProductionStageEvents,
  evaluateStageNextAction,
  evaluateStageTransition,
  initialProductionStageState,
  productionStageGraph,
  stageActionBlockCodes,
} from './stage.ts';
export type {
  StageActionBlockCode,
  StageCompletionTiming,
  StageContext,
  StageEntity,
  StageEvent,
  StageNextAction,
  StageStartTiming,
  StageState,
  StageTransitionDecision,
} from './stage.ts';

export type { OrderDemandPhase } from './demand.ts';
export type {
  OrderRoutingCurrentStage,
  OrderRoutingCurrentStageInput,
  OrderRoutingDecision,
  OrderRoutingInput,
  OrderRoutingRejectionCode,
  OrderRoutingStage,
  OrderRoutingTargetCandidate,
  QueuedMoveTargetDecision,
} from './order-routing.ts';
export {
  evaluateOrderRouteProposal,
  hashOrderRouteProposal,
} from './order-route-proposal/evaluate.ts';
export type {
  OrderRouteProposalCommand,
  OrderRouteProposalConflictFailure,
  OrderRouteProposalContext,
  OrderRouteProposalDecision,
  OrderRouteProposalFailure,
  OrderRouteProposalPolicy,
  OrderRouteProposalValidationFailure,
  ProductionOrderRouteProposal,
} from './order-route-proposal/model.ts';
export type {
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionOrderResolutionAvailability,
  ProductionOrderResolutionDenialReason,
  ProductionOrderRouteReason,
  ProductionOrderSchedulingMutation,
  ProductionOrderStageAttemptMutation,
  ProductionOrderTerminalExecutionMutation,
  ProductionStageNextAction,
  ProductionTerminalLifecycleDecisions,
  ScheduleSupersessionDecision,
} from './execution.ts';
export type { StageTransitionContext, StoredStage } from './stage-context.ts';

export { forecastFixedPulseDemandOutlookV1 } from './fixed-pulse-demand-outlook/forecast-v1.ts';
export type {
  DemandForecastDisposition,
  FixedPulseDemandOutlook,
  FixedPulseDemandOutlookInput,
  ForecastFixedPulseDemandOutlook,
} from './fixed-pulse-demand-outlook/model.ts';
export {
  addMinutes,
  buildFixedPulseStages,
  fixedPulseMakespanMinutes,
  fleetCapacity,
  packFixedPulseItems,
  pulseCapacity,
  selectCapacityOrderedMachineIds,
  sortFixedPulseItems,
} from './fixed-pulse-planning/plan.ts';
export { fixedPulseStages } from './fixed-pulse-planning/model.ts';
export type {
  FixedPulseBatch,
  FixedPulseCapacityMachine,
  FixedPulseItem,
  FixedPulseMachine,
  FixedPulseStage,
  FixedPulseStageKind,
} from './fixed-pulse-planning/model.ts';
export { proposeOnlinePlacementV1 } from './online-order-placement/propose-v1.ts';
export type {
  OnlinePlacementAlgorithmVersion,
  OnlinePlacementBatch,
  OnlinePlacementBatchProjection,
  OnlinePlacementBatchStatus,
  OnlinePlacementInput,
  OnlinePlacementMachine,
  OnlinePlacementMode,
  OnlinePlacementProposal,
  OnlinePlacementRejection,
  OnlinePlacementRejectionCode,
  OnlinePlacementResult,
  OnlinePlacementStage,
  OnlinePlacementStageKind,
  OnlinePlacementTarget,
  ProductionOrderPlacementContext,
  ProductionPlacementFailureReason,
  ProductionPlacementMode,
  ProductionPlacementPreview,
  ProductionPlacementTarget,
  ProposeOnlinePlacement,
} from './online-order-placement/model.ts';
export type {
  PlannedStage,
  ProposeSchedule,
  ProposedScheduleBatch,
  ScheduleAlgorithmVersion,
  ScheduleProposal,
  ScheduleWarning,
  ScheduleWarningCode,
  SchedulingInput,
  SchedulingOutput,
} from './production-schedule/model.ts';
export {
  projectScheduleProposalJson,
  projectScheduleProposalRepresentation,
} from './production-schedule/project.ts';
export { proposeFixedPulseScheduleV2 } from './production-schedule/propose-v2.ts';

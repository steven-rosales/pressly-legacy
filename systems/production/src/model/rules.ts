import {
  allowedProductionAdmissionActions,
  evaluateProductionAdmission,
} from './admission.ts';
import { evaluateBatchMembershipTransition } from './batch-membership.ts';
import { evaluateCurrentPlanAcceptance } from './current-plan.ts';
import { evaluateDemandLifecycle } from './demand.ts';
import { evaluateIntakeAdmission } from './eligibility.ts';
import {
  allowedProductionBatchEvents,
  evaluateProductionBatchTransition,
  initialProductionBatchState,
  productionBatchGraph,
} from './lifecycles/batch.ts';
import {
  allowedProductionOrderExecutionEvents,
  evaluateProductionOrderExecutionTransition,
  initialProductionOrderExecutionState,
  productionOrderExecutionGraph,
  resolveProductionOrderExecutionState,
} from './lifecycles/order-execution.ts';
import {
  allowedProductionOrderResolutionEvents,
  evaluateProductionOrderOperationalAccess,
  evaluateProductionOrderResolutionGuard,
  evaluateProductionOrderResolutionTransition,
  initialProductionOrderResolutionState,
  productionOrderResolutionGraph,
} from './lifecycles/order-resolution.ts';
import {
  allowedProductionOrderStageAttemptEvents,
  evaluateProductionOrderStageAttemptTransition,
  initialProductionOrderStageAttemptState,
  productionOrderStageAttemptGraph,
} from './lifecycles/order-stage-attempt.ts';
import {
  allowedProductionRunEvents,
  evaluateProductionRunTransition,
  initialProductionRunState,
  productionRunGraph,
} from './lifecycles/run.ts';
import {
  allowedProductionShiftEvents,
  evaluateProductionShiftTransition,
  initialProductionShiftState,
  productionShiftGraph,
} from './lifecycles/shift.ts';
import {
  allowedScheduleRevisionEvents,
  evaluateScheduleRevisionTransition,
  initialScheduleRevisionState,
  scheduleRevisionGraph,
} from './lifecycles/schedule-revision.ts';
import { deriveProductionOrderOperationalStatus } from './lifecycles/order-operational-status.ts';
import { evaluateMachineAssignment } from './machine-assignment.ts';
import {
  deriveOrderRoutingCurrentStage,
  evaluateOrderRouting,
  evaluateQueuedMoveTarget,
} from './order-routing.ts';
import { evaluatePlacementCommit } from './placement.ts';
import { evaluateFloorProgressReconciliation } from './progress-reconciliation.ts';
import { evaluateScheduleAcceptance } from './schedule-acceptance.ts';
import { evaluateScheduleStart } from './schedule-start.ts';
import { evaluateShiftPlanningWindow } from './shift-planning-window.ts';
import {
  allowedProductionStageEvents,
  evaluateStageNextAction,
  evaluateStageTransition,
  initialProductionStageState,
  productionStageGraph,
} from './stage.ts';

/**
 * Compiles Production's intrinsic business rules from pure, named policies.
 * The result is immutable and owned by this authority; composition roots may
 * not replace individual rules with runtime-selected behavior.
 */
export const defineProductionRules = () =>
  Object.freeze({
    evaluateProductionAdmission,
    allowedProductionAdmissionActions,
    evaluateDemandLifecycle,
    evaluateIntakeAdmission,
    evaluateScheduleAcceptance,
    evaluateCurrentPlanAcceptance,
    evaluateScheduleStart,
    evaluateShiftPlanningWindow,
    evaluateBatchMembershipTransition,
    deriveOrderRoutingCurrentStage,
    evaluateOrderRouting,
    evaluateQueuedMoveTarget,
    evaluatePlacementCommit,
    evaluateFloorProgressReconciliation,
    evaluateStageNextAction,
    evaluateStageTransition,
    evaluateMachineAssignment,
    initialProductionShiftState,
    evaluateProductionShiftTransition,
    allowedProductionShiftEvents,
    productionShiftGraph,
    initialScheduleRevisionState,
    evaluateScheduleRevisionTransition,
    allowedScheduleRevisionEvents,
    scheduleRevisionGraph,
    initialProductionRunState,
    evaluateProductionRunTransition,
    allowedProductionRunEvents,
    productionRunGraph,
    initialProductionBatchState,
    evaluateProductionBatchTransition,
    allowedProductionBatchEvents,
    productionBatchGraph,
    initialProductionOrderExecutionState,
    resolveProductionOrderExecutionState,
    evaluateProductionOrderExecutionTransition,
    allowedProductionOrderExecutionEvents,
    productionOrderExecutionGraph,
    initialProductionOrderResolutionState,
    evaluateProductionOrderResolutionTransition,
    allowedProductionOrderResolutionEvents,
    productionOrderResolutionGraph,
    evaluateProductionOrderResolutionGuard,
    evaluateProductionOrderOperationalAccess,
    initialProductionOrderStageAttemptState,
    evaluateProductionOrderStageAttemptTransition,
    allowedProductionOrderStageAttemptEvents,
    productionOrderStageAttemptGraph,
    initialProductionStageState,
    allowedProductionStageEvents,
    deriveProductionOrderOperationalStatus,
    stageGraph: productionStageGraph,
  });

export const productionRules = defineProductionRules();

/** The immutable vocabulary of intrinsic rules owned by Production. */
export type ProductionRules = ReturnType<typeof defineProductionRules>;

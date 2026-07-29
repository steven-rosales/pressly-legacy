import {
  allowedProductionAdmissionActions,
  evaluateProductionAdmission,
} from './admission-override/admission-override.policy.ts';
import { evaluateBatchMembershipTransition } from './batch-membership/batch-membership.policy.ts';
import { evaluateCurrentPlanAcceptance } from './current-plan/current-plan.policy.ts';
import { evaluateDemandLifecycle } from './demand-lifecycle/demand-lifecycle.policy.ts';
import { evaluateIntakeAdmission } from './eligibility/production-eligibility.policy.ts';
import { evaluateMachineAssignment } from './machine-assignment/machine-assignment.policy.ts';
import {
  allowedProductionBatchEvents,
  evaluateProductionBatchTransition,
  initialProductionBatchState,
  productionBatchGraph,
} from './lifecycle/production-batch-lifecycle.policy.ts';
import {
  allowedProductionOrderExecutionEvents,
  evaluateProductionOrderExecutionTransition,
  initialProductionOrderExecutionState,
  productionOrderExecutionGraph,
  resolveProductionOrderExecutionState,
} from './lifecycle/production-order-execution-lifecycle.policy.ts';
import {
  allowedProductionOrderResolutionEvents,
  evaluateProductionOrderOperationalAccess,
  evaluateProductionOrderResolutionGuard,
  evaluateProductionOrderResolutionTransition,
  initialProductionOrderResolutionState,
  productionOrderResolutionGraph,
} from './lifecycle/production-order-resolution-lifecycle.policy.ts';
import {
  allowedProductionOrderStageAttemptEvents,
  evaluateProductionOrderStageAttemptTransition,
  initialProductionOrderStageAttemptState,
  productionOrderStageAttemptGraph,
} from './lifecycle/production-order-stage-attempt-lifecycle.policy.ts';
import {
  allowedProductionRunEvents,
  evaluateProductionRunTransition,
  initialProductionRunState,
  productionRunGraph,
} from './lifecycle/production-run-lifecycle.policy.ts';
import {
  allowedProductionShiftEvents,
  evaluateProductionShiftTransition,
  initialProductionShiftState,
  productionShiftGraph,
} from './lifecycle/production-shift-lifecycle.policy.ts';
import {
  allowedScheduleRevisionEvents,
  evaluateScheduleRevisionTransition,
  initialScheduleRevisionState,
  scheduleRevisionGraph,
} from './lifecycle/schedule-revision-lifecycle.policy.ts';
import {
  evaluateOrderRouting,
  evaluateQueuedMoveTarget,
} from './order-routing/order-routing.policy.ts';
import { deriveProductionOrderOperationalStatus } from './lifecycle/production-order-operational-status.policy.ts';
import { evaluatePlacementCommit } from './placement-commit/placement-commit.policy.ts';
import { evaluateFloorProgressReconciliation } from './progress-reconciliation/progress-reconciliation.policy.ts';
import { evaluateScheduleAcceptance } from './schedule-acceptance/schedule-acceptance.policy.ts';
import { evaluateScheduleStart } from './schedule-start/schedule-start.policy.ts';
import { evaluateShiftPlanningWindow } from './shift-planning-window/shift-planning-window.policy.ts';
import {
  allowedProductionStageEvents,
  evaluateStageNextAction,
  evaluateStageTransition,
  initialProductionStageState,
  productionStageGraph,
} from './stage-transition/stage-transition.policy.ts';

export const makeProductionPolicy = () => ({
  evaluateProductionAdmission,
  allowedProductionAdmissionActions,
  evaluateDemandLifecycle,
  evaluateIntakeAdmission,
  evaluateScheduleAcceptance,
  evaluateCurrentPlanAcceptance,
  evaluateScheduleStart,
  evaluateShiftPlanningWindow,
  evaluateBatchMembershipTransition,
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

export type ProductionPolicy = ReturnType<typeof makeProductionPolicy>;

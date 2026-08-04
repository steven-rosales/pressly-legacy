import {
  allowedProductionAdmissionActions,
  evaluateProductionAdmission,
} from '../admission/admission-override.policy.ts';
import { evaluateBatchMembershipTransition } from '../batch-membership/batch-membership.policy.ts';
import { evaluateCurrentPlanAcceptance } from '../current-plan/current-plan.policy.ts';
import { evaluateDemandLifecycle } from '../demand/demand-lifecycle.policy.ts';
import { evaluateIntakeAdmission } from '../eligibility/production-eligibility.policy.ts';
import { evaluateMachineAssignment } from '../machine-assignment/machine-assignment.policy.ts';
import {
  allowedProductionBatchEvents,
  evaluateProductionBatchTransition,
  initialProductionBatchState,
  productionBatchGraph,
} from '../lifecycles/production-batch-lifecycle.lifecycle.ts';
import {
  allowedProductionOrderExecutionEvents,
  evaluateProductionOrderExecutionTransition,
  initialProductionOrderExecutionState,
  productionOrderExecutionGraph,
  resolveProductionOrderExecutionState,
} from '../lifecycles/production-order-execution-lifecycle.lifecycle.ts';
import {
  allowedProductionOrderResolutionEvents,
  evaluateProductionOrderOperationalAccess,
  evaluateProductionOrderResolutionGuard,
  evaluateProductionOrderResolutionTransition,
  initialProductionOrderResolutionState,
  productionOrderResolutionGraph,
} from '../lifecycles/production-order-resolution-lifecycle.lifecycle.ts';
import {
  allowedProductionOrderStageAttemptEvents,
  evaluateProductionOrderStageAttemptTransition,
  initialProductionOrderStageAttemptState,
  productionOrderStageAttemptGraph,
} from '../lifecycles/production-order-stage-attempt-lifecycle.lifecycle.ts';
import {
  allowedProductionRunEvents,
  evaluateProductionRunTransition,
  initialProductionRunState,
  productionRunGraph,
} from '../lifecycles/production-run-lifecycle.lifecycle.ts';
import {
  allowedProductionShiftEvents,
  evaluateProductionShiftTransition,
  initialProductionShiftState,
  productionShiftGraph,
} from '../lifecycles/production-shift-lifecycle.lifecycle.ts';
import {
  allowedScheduleRevisionEvents,
  evaluateScheduleRevisionTransition,
  initialScheduleRevisionState,
  scheduleRevisionGraph,
} from '../lifecycles/schedule-revision-lifecycle.lifecycle.ts';
import {
  evaluateOrderRouting,
  evaluateQueuedMoveTarget,
} from '../order-routing/order-routing.policy.ts';
import { deriveProductionOrderOperationalStatus } from '../lifecycles/production-order-operational-status.policy.ts';
import { evaluatePlacementCommit } from '../placement/placement-commit.policy.ts';
import { evaluateFloorProgressReconciliation } from '../progress-reconciliation/progress-reconciliation.policy.ts';
import { evaluateScheduleAcceptance } from '../schedule-acceptance/schedule-acceptance.policy.ts';
import { evaluateScheduleStart } from '../schedule-start/schedule-start.policy.ts';
import { evaluateShiftPlanningWindow } from '../shift-planning-window/shift-planning-window.policy.ts';
import {
  allowedProductionStageEvents,
  evaluateStageNextAction,
  evaluateStageTransition,
  initialProductionStageState,
  productionStageGraph,
} from '../stage-transition/stage-transition.policy.ts';

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

export type { ProductionRules } from './production-rules.model.ts';

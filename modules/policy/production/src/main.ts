import {
  allowedProductionAdmissionActions,
  evaluateProductionAdmission,
} from './admission-override/admission-override.policy.ts';
import { evaluateBatchMembershipTransition } from './batch-membership/batch-membership.policy.ts';
import { evaluateCurrentPlanAcceptance } from './current-plan/current-plan.policy.ts';
import {
  evaluateDemandLifecycle,
  evaluateDemandReconciliation,
} from './demand-lifecycle/demand-lifecycle.policy.ts';
import { evaluateIntakeAdmission } from './eligibility/production-eligibility.policy.ts';
import { evaluateMachineAssignment } from './machine-assignment/machine-assignment.policy.ts';
import { evaluateOrderRouting } from './order-routing/order-routing.policy.ts';
import { evaluatePlacementCommit } from './placement-commit/placement-commit.policy.ts';
import { evaluateFloorProgressReconciliation } from './progress-reconciliation/progress-reconciliation.policy.ts';
import { evaluateScheduleAcceptance } from './schedule-acceptance/schedule-acceptance.policy.ts';
import { evaluateScheduleStart } from './schedule-start/schedule-start.policy.ts';
import { evaluateShiftPlanningWindow } from './shift-planning-window/shift-planning-window.policy.ts';
import {
  evaluateStageNextAction,
  evaluateStageTransition,
  productionStageGraph,
} from './stage-transition/stage-transition.policy.ts';

export const makeProductionPolicy = () => ({
  evaluateProductionAdmission,
  allowedProductionAdmissionActions,
  evaluateDemandLifecycle,
  evaluateDemandReconciliation,
  evaluateIntakeAdmission,
  evaluateScheduleAcceptance,
  evaluateCurrentPlanAcceptance,
  evaluateScheduleStart,
  evaluateShiftPlanningWindow,
  evaluateBatchMembershipTransition,
  evaluateOrderRouting,
  evaluatePlacementCommit,
  evaluateFloorProgressReconciliation,
  evaluateStageNextAction,
  evaluateStageTransition,
  evaluateMachineAssignment,
  stageGraph: productionStageGraph,
});

export type ProductionPolicy = ReturnType<typeof makeProductionPolicy>;

import { evaluateProductionEligibility } from './eligibility/production-eligibility.policy.ts';
import { evaluateMachineAssignment } from './machine-assignment/machine-assignment.policy.ts';
import { evaluateScheduleAcceptance } from './schedule-acceptance/schedule-acceptance.policy.ts';
import {
  evaluateStageTransition,
  productionStageGraph,
} from './stage-transition/stage-transition.policy.ts';

export const makeProductionPolicy = () => ({
  evaluateEligibility: evaluateProductionEligibility,
  evaluateScheduleAcceptance,
  evaluateStageTransition,
  evaluateMachineAssignment,
  stageGraph: productionStageGraph,
});

export type ProductionPolicy = ReturnType<typeof makeProductionPolicy>;

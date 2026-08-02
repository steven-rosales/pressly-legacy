import type {
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionStageCompletionTiming,
  ProductionStageNextAction,
  ProductionStageStartTiming,
} from '@pressly/contracts';
import type { Result } from '@pressly/kernel';
import type { ProductionPolicyRejection } from './production-policy.model.ts';

export type ProductionFloorPolicyPort = Readonly<{
  evaluateFloorProgressReconciliation: (input: {
    runStatus: string;
    batchStatus: string;
    stages: readonly Readonly<{
      stageRunId: string;
      stage: string;
      status: string;
    }>[];
    target: ProductionFloorProgressTarget;
    sameKindAlreadyActive: boolean;
    assignedMachineIds: readonly string[];
    overlappingMachineIds: readonly string[];
  }) => Result<
    Readonly<{
      currentMilestone: ProductionFloorMilestone;
      targetMilestone: ProductionFloorProgressTarget;
      batchStatus:
        | 'sorting'
        | 'washing'
        | 'drying'
        | 'folding_packaging'
        | 'finished';
      completedStages: readonly (
        | 'sorting'
        | 'washing'
        | 'drying'
        | 'folding_packaging'
      )[];
      activeStage:
        | 'sorting'
        | 'washing'
        | 'drying'
        | 'folding_packaging'
        | null;
      stages: readonly Readonly<{
        stageRunId: string;
        stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
        currentStatus: 'planned' | 'started' | 'completed';
        nextStatus: 'planned' | 'started' | 'completed';
      }>[];
    }>,
    ProductionPolicyRejection
  >;
  evaluateStageNextAction: (
    entity: Readonly<{
      state: string;
      plannedStartAt: Date;
      plannedEndAt: Date;
      actualStartAt: Date | null;
    }>,
    context: Readonly<{
      now: Date;
      productionRunStarted: boolean;
      previousStageCompleted: boolean;
      sameKindAlreadyActive: boolean;
      machinesRequired: boolean;
      assignedMachineIds: readonly string[];
      overlappingMachineIds: readonly string[];
    }>,
  ) => Result<ProductionStageNextAction, ProductionPolicyRejection>;
  evaluateStageTransition: (
    entity: Readonly<{
      state: string;
      plannedStartAt: Date;
      plannedEndAt: Date;
      actualStartAt: Date | null;
    }>,
    event: Readonly<{
      type: 'start' | 'complete' | 'reconcile_start' | 'reconcile_complete';
    }>,
    context: Readonly<{
      now: Date;
      productionRunStarted: boolean;
      previousStageCompleted: boolean;
      sameKindAlreadyActive: boolean;
      machinesRequired: boolean;
      assignedMachineIds: readonly string[];
      overlappingMachineIds: readonly string[];
    }>,
  ) => Result<
    | Readonly<{
        status: 'allowed';
        from: 'planned' | 'started' | 'completed';
        state: 'planned' | 'started' | 'completed';
      }>
    | Readonly<{
        status: 'confirmation_required';
        action: 'start';
        code: 'PLANNED_START_NOT_REACHED';
        message: string;
        timing: ProductionStageStartTiming;
      }>
    | Readonly<{
        status: 'confirmation_required';
        action: 'complete';
        code: 'PULSE_BOUNDARY_NOT_REACHED';
        message: string;
        timing: ProductionStageCompletionTiming;
      }>,
    ProductionPolicyRejection
  >;
  evaluateMachineAssignment: (input: {
    stageKind: string;
    batchWeightLbs: number;
    machines: readonly Readonly<{
      id: string;
      stationKind: string;
      effectiveCapacityLbs: number;
      active: boolean;
      overlaps: boolean;
    }>[];
  }) => Result<
    Readonly<{ machineIds: readonly string[] }>,
    ProductionPolicyRejection
  >;
}>;

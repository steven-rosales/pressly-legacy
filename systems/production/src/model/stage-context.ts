import type { ProductionBatchLifecycleState } from './lifecycles/batch.ts';
import type { ProductionOrderStageAttemptState } from './lifecycles/order-stage-attempt.ts';

export type StoredStage = Readonly<{
  id: string;
  productionBatchId: string;
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  machineIds: readonly string[];
  version: number;
}>;

export type StageTransitionContext = Readonly<{
  stage: StoredStage;
  batch: Readonly<{
    id: string;
    status: ProductionBatchLifecycleState;
    version: number;
  }>;
  attempts: readonly Readonly<{
    id: string;
    status: ProductionOrderStageAttemptState;
  }>[];
  activeOrders: readonly Readonly<{
    id: string;
    status: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
  }>[];
  productionRunStatus: string;
  productionShiftStatus: string;
  productionRunStarted: boolean;
  batchMembershipFrozen: boolean;
  previousStageCompleted: boolean;
  sameKindAlreadyActive: boolean;
  batchWeightLbs: number;
  machines: readonly Readonly<{
    id: string;
    stationKind: string;
    effectiveCapacityLbs: number;
    active: boolean;
    overlaps: boolean;
  }>[];
}>;

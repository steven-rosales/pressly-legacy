import type {
  ProductionBatchProgressReconciledResult,
  ProductionBatchProgressReconciliationResult,
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ReconcileProductionBatchProgressCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type ReconcileProductionBatchProgressCommandWithActor =
  ReconcileProductionBatchProgressCommand & Readonly<{ actorId: string }>;

export type ReconcileProductionBatchProgress = (
  command: ReconcileProductionBatchProgressCommandWithActor,
) => Promise<Result<ProductionBatchProgressReconciliationResult, AppError>>;

export type ReconciliationStage = Readonly<{
  stageRunId: string;
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  version: number;
}>;

export type ReconciliationContext = Readonly<{
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
    productionShiftId: string;
  }>;
  batch: Readonly<{
    id: string;
    status: string;
    version: number;
    derivedWeightLbs: number;
    membershipFrozen: boolean;
  }>;
  stages: readonly ReconciliationStage[];
  activeStageKinds: readonly string[];
  machines: readonly Readonly<{
    id: string;
    stationKind: string;
    effectiveCapacityLbs: number;
    active: boolean;
    overlaps: boolean;
  }>[];
  otherBatchStatuses: readonly string[];
  otherRunStatuses: readonly string[];
}>;

export type ReconciliationProjection = Readonly<{
  currentMilestone: ProductionFloorMilestone;
  targetMilestone: ProductionFloorProgressTarget;
  batchStatus:
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  completedStages: readonly ReconciliationStage['stage'][];
  activeStage: ReconciliationStage['stage'] | null;
  stages: readonly Readonly<{
    stageRunId: string;
    stage: ReconciliationStage['stage'];
    currentStatus: ReconciliationStage['status'];
    nextStatus: ReconciliationStage['status'];
  }>[];
}>;

export type ReconcileProductionBatchProgressRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadContext: (
      locationId: string,
      productionRunId: string,
      productionBatchId: string,
    ) => Promise<ReconciliationContext | null>;
    reconcile: (input: {
      locationId: string;
      context: ReconciliationContext;
      projection: ReconciliationProjection;
      machineIds: readonly string[];
      actorId: string;
      now: Date;
    }) => Promise<ProductionBatchProgressReconciledResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;

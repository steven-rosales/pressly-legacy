import type {
  ProductionBatchLifecycleState,
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionOrderStageAttemptState,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';

export type ProductionFloorProgressReason =
  | 'lpms_unavailable'
  | 'updates_missed'
  | 'other';

export type ProductionExpectedStageVersion = Readonly<{
  stageRunId: string;
  version: number;
}>;

export type ProductionBatchProgressReconciliationConfirmation = Readonly<{
  proposalHash: string;
}>;

export type ReconcileProductionBatchProgressCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  expectedStageVersions: readonly ProductionExpectedStageVersion[];
  target: ProductionFloorProgressTarget;
  reason: ProductionFloorProgressReason;
  note: string | null;
  machineIds: readonly string[];
  confirmation: ProductionBatchProgressReconciliationConfirmation | null;
  idempotencyKey: string;
  actorId: string;
}>;

export type ProductionBatchProgressReconciliationEffects = Readonly<{
  completedStages: readonly ReconciliationStage['stage'][];
  activeStage: ReconciliationStage['stage'] | null;
  finishesBatch: boolean;
  finishesRun: boolean;
  closesShift: boolean;
}>;

export type ProductionBatchProgressReconciliationConfirmationRequiredResult =
  Readonly<{
    status: 'confirmation_required';
    productionRunId: string;
    productionBatchId: string;
    currentMilestone: ProductionFloorMilestone;
    targetMilestone: ProductionFloorProgressTarget;
    queueVersion: number;
    batchVersion: number;
    stageVersions: readonly ProductionExpectedStageVersion[];
    confirmation: ProductionBatchProgressReconciliationConfirmation;
    effects: ProductionBatchProgressReconciliationEffects;
    replayed: false;
  }>;

export type ProductionBatchProgressReconciledResult = Readonly<{
  status: 'reconciled';
  productionRunId: string;
  productionBatchId: string;
  milestone: ProductionFloorProgressTarget;
  queueVersion: number;
  batchVersion: number;
  stageVersions: readonly ProductionExpectedStageVersion[];
  finishedOrderCount: number;
  finishedBagCount: number;
  runCompleted: boolean;
  shiftClosed: boolean;
  replayed: boolean;
}>;

export type ProductionBatchProgressReconciliationResult =
  | ProductionBatchProgressReconciliationConfirmationRequiredResult
  | ProductionBatchProgressReconciledResult;

export type ReconciliationStage = Readonly<{
  stageRunId: string;
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
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
    productionShiftStatus: string;
  }>;
  batch: Readonly<{
    id: string;
    status: ProductionBatchLifecycleState;
    version: number;
    derivedWeightLbs: number;
    membershipFrozen: boolean;
  }>;
  stages: readonly ReconciliationStage[];
  attempts: readonly Readonly<{
    id: string;
    stageRunId: string;
    status: ProductionOrderStageAttemptState;
  }>[];
  activeOrders: readonly Readonly<{
    id: string;
    status: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
  }>[];
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
  batchStatus: Exclude<ProductionBatchLifecycleState, 'queued'>;
  completedStages: readonly ReconciliationStage['stage'][];
  activeStage: ReconciliationStage['stage'] | null;
  stages: readonly Readonly<{
    stageRunId: string;
    stage: ReconciliationStage['stage'];
    currentStatus: ReconciliationStage['status'];
    nextStatus: ReconciliationStage['status'];
  }>[];
}>;

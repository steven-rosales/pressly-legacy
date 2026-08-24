import type {
  ProductionBatchLifecycleDecision,
  ProductionBatchLifecycleState,
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionOrderStageAttemptMutation,
  ProductionOrderStageAttemptState,
  ProductionRules,
  ProductionTerminalLifecycleDecisions,
} from '../../../model/public.ts';

export type FloorProgressReason =
  | 'lpms_unavailable'
  | 'updates_missed'
  | 'other';
export type ExpectedStageVersion = Readonly<{
  stageRunId: string;
  version: number;
}>;
export type ProgressConfirmation = Readonly<{ proposalHash: string }>;

export type ReconcileBatchProgressCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  expectedStageVersions: readonly ExpectedStageVersion[];
  target: ProductionFloorProgressTarget;
  reason: FloorProgressReason;
  note: string | null;
  machineIds: readonly string[];
  confirmation: ProgressConfirmation | null;
  idempotencyKey: string;
  actorId: string;
}>;

export type ReconciliationEffects = Readonly<{
  completedStages: readonly ReconciliationStage['stage'][];
  activeStage: ReconciliationStage['stage'] | null;
  finishesBatch: boolean;
  finishesRun: boolean;
  closesShift: boolean;
}>;

export type ReconciliationConfirmationRequired = Readonly<{
  status: 'confirmation_required';
  productionRunId: string;
  productionBatchId: string;
  currentMilestone: ProductionFloorMilestone;
  targetMilestone: ProductionFloorProgressTarget;
  queueVersion: number;
  batchVersion: number;
  stageVersions: readonly ExpectedStageVersion[];
  confirmation: ProgressConfirmation;
  effects: ReconciliationEffects;
  replayed: false;
}>;

export type ReconciledBatchProgress = Readonly<{
  status: 'reconciled';
  productionRunId: string;
  productionBatchId: string;
  milestone: ProductionFloorProgressTarget;
  queueVersion: number;
  batchVersion: number;
  stageVersions: readonly ExpectedStageVersion[];
  finishedOrderCount: number;
  finishedBagCount: number;
  runCompleted: boolean;
  shiftClosed: boolean;
  replayed: boolean;
}>;

export type ReconcileBatchProgressResult =
  | ReconciliationConfirmationRequired
  | ReconciledBatchProgress;

export type ReconcileBatchProgressExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

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

export type ReconcileBatchProgressPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateMachineAssignment'
  | 'evaluateFloorProgressReconciliation'
  | 'evaluateStageTransition'
  | 'evaluateProductionOrderStageAttemptTransition'
  | 'evaluateProductionBatchTransition'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderExecutionTransition'
  | 'evaluateProductionRunTransition'
  | 'evaluateProductionShiftTransition'
>;

export type ReconciliationCommitPlan = Readonly<{
  context: ReconciliationContext;
  projection: ReconciliationProjection;
  confirmationRequired: ReconciliationConfirmationRequired;
  stageLifecycles: readonly Readonly<{
    stageRunId: string;
    lifecycle: Readonly<{
      from: 'planned' | 'started';
      state: 'started' | 'completed';
    }>;
  }>[];
  batchLifecycle: ProductionBatchLifecycleDecision | null;
  attemptLifecycles: readonly ProductionOrderStageAttemptMutation[];
  machineIds: readonly string[];
  terminalLifecycle: ProductionTerminalLifecycleDecisions | null;
  now: Date;
}>;

export type ReconcileBatchProgressDecision =
  | Readonly<{ kind: 'preview'; result: ReconciliationConfirmationRequired }>
  | Readonly<{ kind: 'commit'; plan: ReconciliationCommitPlan }>
  | Readonly<{
      kind: 'reject';
      failure: ReconcileBatchProgressExpectedFailure;
    }>;

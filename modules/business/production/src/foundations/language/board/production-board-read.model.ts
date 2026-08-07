import type { ProductionOrderListItem } from '../orders/production-order-list-item.model.ts';

export type ProductionBoardStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type ProductionBoardDueBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'later';

export type ProductionBoardOrderSummary = Readonly<{
  id: string;
  externalOrderId: string;
  dueAt: Date;
  dueBucket: ProductionBoardDueBucket;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type ProductionBoardPlacementTarget =
  | Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>
  | Readonly<{
      kind: 'new_batch';
      sequence: number;
    }>;

export type ProductionBoardPlacementPreview = Readonly<{
  target: ProductionBoardPlacementTarget;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  projectedCompletionAt: Date;
  overtimeMinutes: number;
}>;

export type ProductionBoardPendingPlacement =
  | Readonly<{
      status: 'awaiting_run';
      reason: 'no_started_run' | 'automatic_placement_not_attempted';
      message: string;
    }>
  | Readonly<{
      status: 'ambiguous_run';
      reason: 'multiple_started_runs';
      message: string;
      candidateProductionRunIds: readonly string[];
    }>
  | Readonly<{
      status: 'confirmation_required';
      mode: 'automatic' | 'manager_exact';
      productionRunId: string;
      target: ProductionBoardPlacementTarget;
      affectedBatchIds: readonly string[];
      queueVersion: number;
      proposalHash: string;
      projectedCompletionAt: Date;
      overtimeMinutes: number;
    }>
  | Readonly<{
      status: 'not_placed';
      mode: 'automatic' | 'manager_exact';
      productionRunId: string;
      reason:
        | 'hard_capacity_exceeded'
        | 'run_not_started'
        | 'run_completed'
        | 'order_not_eligible'
        | 'order_already_scheduled'
        | 'no_mutable_position'
        | 'queue_conflict'
        | 'proposal_stale';
      message: string;
      queueVersion: number;
      preview: ProductionBoardPlacementPreview | null;
    }>;

export type ProductionBoardPendingOrder = ProductionBoardOrderSummary &
  Readonly<{ placement: ProductionBoardPendingPlacement }>;

export type ProductionBoardShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: 'draft' | 'open' | 'closed';
  version: number;
}>;

export type ProductionBoardRun = Readonly<{
  id: string;
  productionShiftId: string;
  status: 'planned' | 'started' | 'completed';
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeAcknowledgement: Readonly<{
    proposalHash: string;
    queueVersion: number;
    acknowledgedBy: string;
    acknowledgedAt: Date;
  }> | null;
  version: number;
}>;

export type ProductionBoardStageNextAction =
  | Readonly<{ state: 'available'; action: 'start' | 'complete' }>
  | Readonly<{
      state: 'blocked';
      action: 'start' | 'complete';
      code:
        | 'PRODUCTION_RUN_NOT_STARTED'
        | 'PREVIOUS_STAGE_INCOMPLETE'
        | 'STAGE_KIND_ALREADY_ACTIVE'
        | 'MACHINE_ASSIGNMENT_REQUIRED'
        | 'MACHINE_ASSIGNMENT_OVERLAPS';
      message: string;
      availableAt: Date | null;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'start';
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      availableAt: Date;
      timing: Readonly<{
        plannedStartAt: Date;
        plannedEndAt: Date;
        observedAt: Date;
        remainingMilliseconds: number;
      }>;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'complete';
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      availableAt: Date;
      timing: Readonly<{
        actualStartAt: Date;
        plannedEndAt: Date;
        completionBoundaryAt: Date;
        observedAt: Date;
        plannedDurationMilliseconds: number;
        elapsedMilliseconds: number;
        remainingMilliseconds: number;
      }>;
    }>
  | Readonly<{ state: 'terminal'; reason: 'stage_completed' }>;

export type ProductionBoardStage = Readonly<{
  id: string;
  productionBatchId: string;
  stage: ProductionBoardStageKind;
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  machineIds: readonly string[];
  nextAction: ProductionBoardStageNextAction;
  allowedActions: readonly [] | readonly ['start' | 'complete'];
  version: number;
}>;

export type UnevaluatedProductionBoardStage = Omit<
  ProductionBoardStage,
  'nextAction' | 'allowedActions'
>;

export type ProductionBoardBatchOrder = ProductionBoardOrderSummary &
  Readonly<{
    placementProvenance:
      | 'initial_schedule'
      | 'automatic'
      | 'manager_exact'
      | 'manual_rebatch'
      | 'exception_route';
    pinnedAt: Date | null;
    pinnedBy: string | null;
  }>;

export type ProductionBoardBatch = Readonly<{
  id: string;
  sequence: number;
  status:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  pulseMinutes: number;
  membership:
    | Readonly<{ state: 'mutable' }>
    | Readonly<{ state: 'frozen'; frozenAt: Date; frozenBy: string }>;
  orders: readonly ProductionBoardBatchOrder[];
  stages: readonly ProductionBoardStage[];
  version: number;
}>;

export type UnevaluatedProductionBoardBatch = Omit<
  ProductionBoardBatch,
  'stages'
> &
  Readonly<{ stages: readonly UnevaluatedProductionBoardStage[] }>;

export type ProductionBoard = Readonly<{
  productionShift: ProductionBoardShift;
  productionRun: ProductionBoardRun;
  batches: readonly ProductionBoardBatch[];
  eligibleOrders: readonly ProductionBoardPendingOrder[];
  asOf: Date;
}>;

export type UnevaluatedProductionBoard = Omit<ProductionBoard, 'batches'> &
  Readonly<{ batches: readonly UnevaluatedProductionBoardBatch[] }>;

export type ProductionBoardStageNextActionReadContext = Readonly<{
  stageRunId: string;
  entity: Readonly<{
    state: string;
    plannedStartAt: Date;
    plannedEndAt: Date;
    actualStartAt: Date | null;
  }>;
  context: Readonly<{
    now: Date;
    productionRunStarted: boolean;
    previousStageCompleted: boolean;
    sameKindAlreadyActive: boolean;
    machinesRequired: boolean;
    assignedMachineIds: readonly string[];
    overlappingMachineIds: readonly string[];
  }>;
}>;

export type ProductionBoardProjection = Readonly<{
  board: UnevaluatedProductionBoard;
  stageNextActionContexts: readonly ProductionBoardStageNextActionReadContext[];
  orders: readonly ProductionOrderListItem[];
}>;

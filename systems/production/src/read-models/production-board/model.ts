import type {
  ProductionRules,
  StageContext,
  StageEntity,
} from '../../model/public.ts';

export type BoardStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type BoardDueBucket = 'overdue' | 'today' | 'tomorrow' | 'later';

export type BoardOrderSummary = Readonly<{
  id: string;
  externalOrderId: string;
  dueAt: Date;
  dueBucket: BoardDueBucket;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type BoardPlacementTarget =
  | Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>
  | Readonly<{ kind: 'new_batch'; sequence: number }>;

export type BoardPlacementPreview = Readonly<{
  target: BoardPlacementTarget;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  projectedCompletionAt: Date;
  overtimeMinutes: number;
}>;

export type BoardPendingPlacement =
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
      target: BoardPlacementTarget;
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
      preview: BoardPlacementPreview | null;
    }>;

export type BoardPendingOrder = BoardOrderSummary &
  Readonly<{ placement: BoardPendingPlacement }>;

export type BoardShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: 'draft' | 'open' | 'closed';
  version: number;
}>;

export type BoardRun = Readonly<{
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

export type BoardStageNextAction =
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

export type BoardStage = Readonly<{
  id: string;
  productionBatchId: string;
  stage: BoardStageKind;
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  machineIds: readonly string[];
  nextAction: BoardStageNextAction;
  version: number;
}>;

export type UnevaluatedBoardStage = Omit<BoardStage, 'nextAction'>;

export type BoardBatchOrder = BoardOrderSummary &
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

export type BoardBatch = Readonly<{
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
  orders: readonly BoardBatchOrder[];
  stages: readonly BoardStage[];
  version: number;
}>;

export type UnevaluatedBoardBatch = Omit<BoardBatch, 'stages'> &
  Readonly<{ stages: readonly UnevaluatedBoardStage[] }>;

export type ProductionBoard = Readonly<{
  productionShift: BoardShift;
  productionRun: BoardRun;
  batches: readonly BoardBatch[];
  eligibleOrders: readonly BoardPendingOrder[];
  asOf: Date;
}>;

export type UnevaluatedProductionBoard = Omit<ProductionBoard, 'batches'> &
  Readonly<{ batches: readonly UnevaluatedBoardBatch[] }>;

export type BoardOrderListItem = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  dueBucket: BoardDueBucket;
  priority: boolean;
  status:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountProvenance: 'external_source' | 'operator_intake' | null;
  intakeVersion: number | null;
  version: number;
}>;

export type BoardStageNextActionReadContext = Readonly<{
  stageRunId: string;
  entity: StageEntity;
  context: StageContext;
}>;

export type BoardProjection = Readonly<{
  board: UnevaluatedProductionBoard;
  stageNextActionContexts: readonly BoardStageNextActionReadContext[];
  orders: readonly BoardOrderListItem[];
}>;

export type BoardShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
}>;

export type BoardRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: Date | null;
  version: number;
}>;

export type BoardOrderRow = Readonly<{
  id: string;
  locationId: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  pendingPlacement: unknown;
  version: number;
}>;

export type BoardBatchRow = Readonly<{
  id: string;
  sequenceIndex: number;
  status: string;
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  pulseMinutes: number;
  membershipFrozenAt: Date | null;
  membershipFrozenBy: string | null;
  version: number;
}>;

export type BoardBatchOrderRow = Readonly<{
  productionBatchId: string;
  productionOrderId: string;
  active: boolean;
  placementProvenance: string;
  pinnedAt: Date | null;
  pinnedBy: string | null;
}>;

export type BoardStageRow = Readonly<{
  id: string;
  productionBatchId: string;
  stageKind: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  version: number;
}>;

export type BoardAssignmentRow = Readonly<{
  stageRunId: string;
  machineId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
}>;

export type BoardActiveStageRow = Readonly<{
  id: string;
  stageKind: string;
}>;

export type BoardProjectionInput = Readonly<{
  shift: BoardShiftRow;
  run: BoardRunRow;
  orders: readonly BoardOrderRow[];
  batches: readonly BoardBatchRow[];
  batchOrders: readonly BoardBatchOrderRow[];
  stages: readonly BoardStageRow[];
  assignments: readonly BoardAssignmentRow[];
  activeStages: readonly BoardActiveStageRow[];
  activeProductionRunIds: readonly string[];
  now: Date;
}>;

export type BoardPolicy = Pick<ProductionRules, 'evaluateStageNextAction'>;

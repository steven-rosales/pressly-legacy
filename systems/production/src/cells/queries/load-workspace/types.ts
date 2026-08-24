import type {
  BoardDueBucket,
  BoardOrderListItem,
} from '../../../read-models/production-board/model.ts';

export const loadWorkspaceOperationId = 'production.load-workspace.v1' as const;

export type LoadWorkspaceInput = Readonly<{
  locationId: string;
  shiftId?: string;
}>;

export type WorkspaceLocation = Readonly<{
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type WorkspaceShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: 'draft' | 'open' | 'closed';
  version: number;
}>;

export type WorkspaceShiftSelection = Readonly<{
  productionShiftId: string;
  version: number;
  selectedOrderIds: readonly string[];
}>;

export type WorkspaceShiftCandidate = Readonly<{
  productionShiftId: string;
  startsAt: Date;
  endsAt: Date;
  reason: 'started_run' | 'accepted_plan' | 'open_shift';
  productionRunId: string | null;
  scheduleRunId: string | null;
}>;

export type WorkspaceStation = Readonly<{
  id: string;
  locationId: string;
  kind: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  label: string;
  sortOrder: number;
  isActive: boolean;
}>;

export type WorkspaceMachine = Readonly<{
  id: string;
  stationKind: 'washing' | 'drying';
  label: string;
  effectiveCapacityLbs: number;
  active: boolean;
}>;

export type WorkspaceRun = Readonly<{
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

export type SchedulerAlgorithmVersion =
  | 'fixed-pulse-ffd-v1'
  | 'fixed-pulse-ffd-v2';

export type WorkspaceSchedulerConfig = Readonly<{
  id: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: SchedulerAlgorithmVersion;
  version: number;
  stageFitAssertion: Readonly<{
    sortingFits: true;
    washingFits: true;
    dryingFits: true;
    assertedBy: string;
    assertedAt: string;
  }>;
  publishedAt: string;
}>;

export type ScheduleWarningCode =
  | 'SHIFT_OVERFLOW'
  | 'OVERSIZED_ORDER'
  | 'NO_ACTIVE_WASHERS'
  | 'NO_ACTIVE_DRYERS'
  | 'NO_FOLDING_CAPACITY';

export type WorkspaceScheduleProposal = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  status: 'draft' | 'accepted' | 'superseded' | 'rejected';
  inputSnapshotHash: string;
  outputPlanHash: string;
  algorithmVersion: SchedulerAlgorithmVersion;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly Readonly<{
    sequence: number;
    orderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: readonly Readonly<{
      stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
      startsAt: string;
      endsAt: string;
      machineIds: readonly string[];
    }>[];
  }>[];
  unplacedOrderIds: readonly string[];
  warnings: readonly Readonly<{
    code: ScheduleWarningCode;
    message: string;
    blocking: boolean;
    orderIds?: readonly string[] | undefined;
  }>[];
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
  supersededAt: string | null;
}>;

export type PlacementMode = 'automatic' | 'manager_exact';

export type PlacementTarget =
  | Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>
  | Readonly<{ kind: 'new_batch'; sequence: number }>;

export type PlacementFailureReason =
  | 'hard_capacity_exceeded'
  | 'run_not_started'
  | 'run_completed'
  | 'order_not_eligible'
  | 'order_already_scheduled'
  | 'no_mutable_position'
  | 'queue_conflict'
  | 'proposal_stale';

export type PendingPlacement =
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
      mode: PlacementMode;
      productionRunId: string;
      target: PlacementTarget;
      affectedBatchIds: readonly string[];
      queueVersion: number;
      proposalHash: string;
      projectedCompletionAt: string;
      overtimeMinutes: number;
    }>
  | Readonly<{
      status: 'not_placed';
      mode: PlacementMode;
      productionRunId: string;
      reason: PlacementFailureReason;
      message: string;
      queueVersion: number;
      preview: Readonly<{
        target: PlacementTarget;
        affectedBatchIds: readonly string[];
        queueVersion: number;
        proposalHash: string;
        projectedCompletionAt: string;
        overtimeMinutes: number;
      }> | null;
    }>;

export type WorkspacePendingOrder = Readonly<{
  id: string;
  externalOrderId: string;
  dueAt: string;
  dueBucket: BoardDueBucket;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
  placement: PendingPlacement;
}>;

export type OnlinePlacementInput = Readonly<{
  order: Readonly<{
    id: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>;
  run: Readonly<{
    id: string;
    queueVersion: number;
    startsAt: string;
    shiftEndsAt: string;
    pulseMinutes: number;
    pulseCapacityLbs: number;
  }>;
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  batches: readonly Readonly<{
    id: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
    orderIds: readonly string[];
    priorityOrderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: readonly Readonly<{
      stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
      startsAt: string;
      endsAt: string;
      machineIds: readonly string[];
    }>[];
  }>[];
  mode:
    | Readonly<{ type: 'automatic' }>
    | Readonly<{ type: 'manager_exact'; targetBatchId: string }>;
}>;

export type RunPlacementContext = Readonly<{
  input: Pick<OnlinePlacementInput, 'run' | 'machines' | 'batches'>;
  runStatus: string;
  batchVersions: Readonly<Record<string, number>>;
  assignedOrderIds: readonly string[];
}>;

export type OrderPlacementContext = Readonly<{
  input: OnlinePlacementInput;
  runStatus: string;
  orderStatus: string;
  orderExecutionStatus: string;
  orderVersion: number;
  orderAlreadyAssigned: boolean;
  batchVersions: Readonly<Record<string, number>>;
}>;

export type LiveRunPlacementOrder = Readonly<{
  order: WorkspacePendingOrder;
  context: OrderPlacementContext;
}>;

export type OnlinePlacementProposal = Readonly<{
  kind: 'proposed';
  algorithmVersion: 'online-stable-insertion-v1';
  inputSnapshotHash: string;
  placementPlanHash: string;
  canonicalPlacement: string;
  expectedQueueVersion: number;
  target:
    | Readonly<{ type: 'existing_batch'; batchId: string; sequence: number }>
    | Readonly<{ type: 'new_batch'; insertAtSequence: number }>;
  affectedFromSequence: number;
  affectedBatches: readonly Readonly<{
    sourceBatchId: string | null;
    sequence: number;
    status: OnlinePlacementInput['batches'][number]['status'];
    membershipFrozen: boolean;
    orderIds: readonly string[];
    priorityOrderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: OnlinePlacementInput['batches'][number]['stages'];
    changed: boolean;
  }>[];
  projectedCompletionAt: string;
  overtime: Readonly<{
    required: boolean;
    shiftEndsAt: string;
    overrunMinutes: number;
  }>;
}>;

export type OnlinePlacementResult =
  | OnlinePlacementProposal
  | Readonly<{
      kind: 'rejected';
      algorithmVersion: 'online-stable-insertion-v1';
      inputSnapshotHash: string;
      reason: Readonly<{ code: string; message: string }>;
    }>;

export type LiveAutomaticPlacement = Readonly<{
  mode: 'automatic';
  target: PlacementTarget;
  expectedBatchVersion: number | null;
  allowedActions: readonly ['place_automatically' | 'confirm_overtime'];
  proposalHash: string;
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  capacity: Readonly<{ beforeLbs: number; afterLbs: number; limitLbs: number }>;
  projectedCompletionAt: string;
  overtime: Readonly<{
    required: boolean;
    minutes: number;
    shiftEndsAt: string;
  }>;
}>;

export type LiveExactBatchTarget = Omit<
  LiveAutomaticPlacement,
  'mode' | 'target' | 'expectedBatchVersion' | 'allowedActions'
> &
  Readonly<{
    mode: 'manager_exact';
    target: Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>;
    expectedBatchVersion: number;
    allowedActions: readonly ['place_exactly' | 'confirm_overtime'];
  }>;

export type LiveRunChanges = Readonly<{
  productionRunId: string;
  queueVersion: number;
  pulseCapacityLbs: number;
  orders: readonly (WorkspacePendingOrder &
    Readonly<{
      recommendedPlacement:
        | Readonly<{ status: 'available'; placement: LiveAutomaticPlacement }>
        | Readonly<{
            status: 'unavailable';
            reason: PlacementFailureReason;
            message: string;
          }>;
      exactBatchTargets: readonly LiveExactBatchTarget[];
    }>)[];
}>;

export type DemandForecastInput = Readonly<{
  demand: readonly Readonly<{
    id: string;
    dueAt: string;
    priority: boolean;
    estimatedWeightLbs: number;
    disposition: 'expected' | 'ready';
  }>[];
  machines: readonly WorkspaceMachine[];
  shift: Readonly<{
    startsAt: string;
    timezone: string;
    effectiveFolderCount: number;
  }>;
  config: Readonly<{
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
  }>;
}>;

export type DemandForecastOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-demand-outlook-v1';
  startsAt: string;
  completesAt: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  batches: readonly Readonly<{
    sequence: number;
    demandIds: readonly string[];
    estimatedWeightLbs: number;
    expectedOrderCount: number;
    readyOrderCount: number;
  }>[];
  unplacedDemandIds: readonly string[];
}>;

export type WorkspaceScheduler = Readonly<{
  forecastDemand: (input: DemandForecastInput) => DemandForecastOutput;
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
}>;

export type DemandOutlookRow = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  externalOrderId: string;
  phase: string;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  priority: boolean;
  productionStatus: string | null;
  bagCount: number | null;
}>;

export type DemandOutlookItem = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  externalOrderId: string;
  phase:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  dueAt: Date;
  estimatedWeightLbs: number | null;
  readiness:
    | 'awaiting_release'
    | 'awaiting_intake'
    | 'ready'
    | 'in_production'
    | 'finished'
    | 'not_admitted';
  productionStatus: BoardOrderListItem['status'] | null;
  bagCount: number | null;
}>;

export type DemandOutlook = Readonly<{
  productionShiftId: string;
  horizonCutoffAt: Date;
  totalOrderCount: number;
  totalEstimatedWeightLbs: number;
  estimateMissingOrderCount: number;
  expectedOrderCount: number;
  expectedEstimatedWeightLbs: number;
  readyOrderCount: number;
  readyEstimatedWeightLbs: number;
  inProductionOrderCount: number;
  inProductionEstimatedWeightLbs: number;
  items: readonly DemandOutlookItem[];
  forecast: DemandForecastOutput | null;
}>;

export type WorkspaceOrderRow = Readonly<{
  id: string;
  locationId: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  executionStatus: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  pendingPlacement: unknown;
  version: number;
}>;

export type WorkspaceShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
}>;

export type WorkspaceRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: string;
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: Date | null;
  version: number;
  createdAt: Date;
}>;

export type WorkspaceSchedulerConfigRow = Readonly<{
  id: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: string;
  version: number;
  stageFitAssertion: unknown;
  publishedAt: Date;
}>;

export type WorkspaceScheduleRow = Readonly<{
  id: string;
  productionShiftId: string;
  schedulerConfigId: string;
  status: string;
  inputSnapshotHash: string;
  outputPlanHash: string;
  algorithmVersion: string;
  outputPlan: unknown;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  acknowledgedWarningCodes: unknown;
  supersededAt: Date | null;
}>;

export type WorkspaceSelectionSchedule = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  createdAt: Date;
}>;

export type WorkspaceSelection<
  Schedule extends WorkspaceSelectionSchedule = WorkspaceSelectionSchedule,
> = Readonly<{
  currentShift: WorkspaceShiftRow | undefined;
  candidateShifts: readonly WorkspaceShiftCandidate[];
  activeRunRows: readonly WorkspaceRunRow[];
  actionableScheduleRows: readonly Schedule[];
}>;

export type WorkspaceBaseModel = Readonly<{
  location: WorkspaceLocation;
  currentShift: WorkspaceShift | null;
  shiftSelection: WorkspaceShiftSelection | null;
  candidateShifts: readonly WorkspaceShiftCandidate[];
  currentSchedulerConfig: WorkspaceSchedulerConfig | null;
  currentScheduleProposal: WorkspaceScheduleProposal | null;
  activeRuns: readonly WorkspaceRun[];
  orders: readonly BoardOrderListItem[];
  pendingEligibleOrders: readonly WorkspacePendingOrder[];
  liveRunChanges: null;
  demandOutlook: null;
  board: null;
  stations: readonly WorkspaceStation[];
  machines: readonly WorkspaceMachine[];
  asOf: Date;
}>;

export type LoadWorkspaceClock = Readonly<{ now: () => Date }>;

export type LoadWorkspaceLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The active production location was not found.';
  safeMessage: 'The active production location was not found.';
}>;

export type LoadWorkspaceShiftNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_shift_not_found';
  message: 'The requested production shift was not found at this location.';
  safeMessage: 'The requested production shift was not found at this location.';
}>;

export type LoadWorkspaceLivePlacementConflict = Readonly<{
  tag: 'ProductionFailure';
  kind: 'conflict';
  code: 'production_live_placement_run_mismatch';
  message: 'The live-placement projection does not match the selected started run.';
  safeMessage: 'The live-placement projection does not match the selected started run.';
}>;

export type LoadWorkspaceExpectedFailure =
  | LoadWorkspaceLocationNotFound
  | LoadWorkspaceShiftNotFound
  | LoadWorkspaceLivePlacementConflict;

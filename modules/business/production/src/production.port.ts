import type {
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionOrderRouteReason,
  ProductionStageCompletionTiming,
  ProductionStageNextAction,
  ProductionStageStartTiming,
} from '@pressly/contracts';

export type PolicyDecision<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{ code: string; message: string }>;
    }>;

export type OrderRoutingStage =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type OrderRoutingPolicyInput = Readonly<{
  command: 'queued_rebatch' | 'defer_or_rework';
  order: Readonly<{ productionOrderId: string; weightLbs: number }>;
  source: Readonly<{
    productionBatchId: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
  }>;
  currentStage: OrderRoutingStage;
  restartStage: OrderRoutingStage;
  targetCandidates: readonly Readonly<{
    productionBatchId: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
    stages: readonly Readonly<{
      stage: OrderRoutingStage;
      status: 'planned' | 'started' | 'completed';
      assignedWeightLbs: number;
      capacityLbs: number;
    }>[];
  }>[];
}>;

export type OrderRoutingPolicyDecision =
  | Readonly<{
      decision: 'rejected';
      command: OrderRoutingPolicyInput['command'];
      reason: Readonly<{ code: string; message: string }>;
    }>
  | Readonly<{
      decision: 'accepted';
      command: OrderRoutingPolicyInput['command'];
      wholeOrder: Readonly<{
        productionOrderId: string;
        weightLbs: number;
      }>;
      route: Readonly<{
        sourceProductionBatchId: string;
        sourceSequence: number;
        targetProductionBatchId: string;
        targetSequence: number;
        currentStage: OrderRoutingStage;
        restartStage: OrderRoutingStage;
        releasedUnfinishedStages: readonly OrderRoutingStage[];
        reworkStages: readonly OrderRoutingStage[];
        targetAssignments: readonly Readonly<{
          stage: OrderRoutingStage;
          sourceDisposition:
            | 'release_unfinished'
            | 'preserve_completed_for_rework';
          assignedWeightBeforeLbs: number;
          assignedWeightAfterLbs: number;
          capacityLbs: number;
        }>[];
      }>;
    }>;

export type ProductionSignalsPort = Readonly<{
  planSuperseded: () => void;
  runStarted: () => void;
  placementOutcome: (input: {
    status: 'placed' | 'confirmation_required' | 'not_placed';
    mode: 'automatic' | 'manager_exact';
    reason?: string;
  }) => void;
  queueConflict: (input: { operation: string }) => void;
  batchFrozen: (input: { source: 'explicit' | 'stage_start' }) => void;
  overtimeConfirmed: () => void;
  orderRouteOutcome: (input: {
    operation: 'preview' | 'commit';
    status:
      | 'proposed'
      | 'committed'
      | 'replayed'
      | 'rejected'
      | 'conflict'
      | 'failed';
    kind: 'queued_move' | 'exception';
    reason: ProductionOrderRouteReason;
  }) => void;
  progressReconciled: (input: {
    target: ProductionFloorProgressTarget;
    runCompleted: boolean;
  }) => void;
}>;

export const nullProductionSignals: ProductionSignalsPort = {
  planSuperseded: () => undefined,
  runStarted: () => undefined,
  placementOutcome: () => undefined,
  queueConflict: () => undefined,
  batchFrozen: () => undefined,
  overtimeConfirmed: () => undefined,
  orderRouteOutcome: () => undefined,
  progressReconciled: () => undefined,
};

export type ProductionPolicyPort = Readonly<{
  evaluateOrderRouting: (
    input: OrderRoutingPolicyInput,
  ) => OrderRoutingPolicyDecision;
  evaluateEligibility: (input: {
    state: 'ready_for_production' | 'not_ready';
    derivedWeightLbs: number;
    bagCount: number | null;
  }) => PolicyDecision<Readonly<{ eligible: true }>>;
  evaluateScheduleAcceptance: (input: {
    status: string;
    expectedOutputPlanHash: string;
    actualOutputPlanHash: string;
    warningCodes: readonly string[];
    blockingWarningCodes: readonly string[];
    acknowledgedWarningCodes: readonly string[];
    batches: readonly Readonly<{
      weightLbs: number;
      capacityLbs: number;
      orderIds: readonly string[];
      stages: readonly Readonly<{
        stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
        startsAt: Date;
        endsAt: Date;
        pulseMinutes: number;
      }>[];
    }>[];
  }) => PolicyDecision<Readonly<{ accepted: true }>>;
  evaluateCurrentPlanAcceptance: (input: {
    scheduleRunId: string;
    status: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
  }) => PolicyDecision<Readonly<{ current: true }>>;
  evaluateScheduleStart: (input: {
    scheduleRunId: string;
    status: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
    productionRunExists: boolean;
    batchCount: number;
  }) => PolicyDecision<Readonly<{ started: true }>>;
  evaluateShiftPlanningWindow: (input: {
    action: 'compute' | 'accept' | 'start';
    now: Date;
    startsAt: Date;
    endsAt: Date;
  }) => PolicyDecision<Readonly<{ allowed: true }>>;
  evaluateBatchMembershipTransition: (input: {
    action: 'freeze' | 'unfreeze';
    batchStatus: string;
    membershipFrozen: boolean;
    actorRole: string;
  }) => PolicyDecision<Readonly<{ membershipFrozen: boolean }>>;
  evaluatePlacementCommit: (input: {
    runStatus: string;
    orderStatus: string;
    orderAlreadyAssigned: boolean;
    expectedQueueVersion: number;
    actualQueueVersion: number;
    placementType: 'automatic' | 'manager_exact';
    actorRole: string;
    orderWeightLbs: number;
    pulseCapacityLbs: number;
    overtime: Readonly<{
      required: boolean;
      proposalHash: string;
      confirmation: Readonly<{
        proposalHash: string;
        queueVersion: number;
      }> | null;
    }>;
  }) => PolicyDecision<Readonly<{ commit: true }>>;
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
  }) => PolicyDecision<
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
    }>
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
  ) => PolicyDecision<ProductionStageNextAction>;
  evaluateStageTransition: (
    entity: Readonly<{
      state: string;
      plannedStartAt: Date;
      plannedEndAt: Date;
      actualStartAt: Date | null;
    }>,
    event: Readonly<{ type: 'start' | 'complete' }>,
    context: Readonly<{
      now: Date;
      productionRunStarted: boolean;
      previousStageCompleted: boolean;
      sameKindAlreadyActive: boolean;
      machinesRequired: boolean;
      assignedMachineIds: readonly string[];
      overlappingMachineIds: readonly string[];
    }>,
  ) => PolicyDecision<
    | Readonly<{
        status: 'allowed';
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
      }>
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
  }) => PolicyDecision<Readonly<{ machineIds: readonly string[] }>>;
}>;

export type SchedulingInput = Readonly<{
  orders: readonly Readonly<{
    id: string;
    externalOrderId: string;
    dueAt: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>[];
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  shift: Readonly<{
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    effectiveFolderCount: number;
    version: number;
  }>;
  config: Readonly<{
    id: string;
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
    algorithmVersion: 'fixed-pulse-ffd-v2';
    version: number;
  }>;
}>;

export type SchedulingOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-ffd-v2';
  inputSnapshotHash: string;
  outputPlanHash: string;
  canonicalOutput: string;
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
    code:
      | 'SHIFT_OVERFLOW'
      | 'OVERSIZED_ORDER'
      | 'NO_ACTIVE_WASHERS'
      | 'NO_ACTIVE_DRYERS'
      | 'NO_FOLDING_CAPACITY';
    message: string;
    blocking: boolean;
    orderIds?: readonly string[];
  }>[];
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

export type OnlinePlacementProposal = Readonly<{
  kind: 'proposed';
  algorithmVersion: 'online-stable-insertion-v1';
  inputSnapshotHash: string;
  placementPlanHash: string;
  canonicalPlacement: string;
  expectedQueueVersion: number;
  target:
    | Readonly<{
        type: 'existing_batch';
        batchId: string;
        sequence: number;
      }>
    | Readonly<{
        type: 'new_batch';
        insertAtSequence: number;
      }>;
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

export type ProductionSchedulerPort = Readonly<{
  propose: (input: SchedulingInput) => SchedulingOutput;
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
}>;

export type ClockPort = Readonly<{ now: () => Date }>;
export type IdPort = Readonly<{ next: () => string }>;

export type Transactional<Operations> = Readonly<{
  transaction: <T>(work: (operations: Operations) => Promise<T>) => Promise<T>;
}>;

export type WorkEventCommandIdentity = Readonly<{
  operation: string;
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: string;
    entityId: string | null;
  }>;
  expectedVersion: number | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type StoredWorkEvent = Readonly<{
  command: unknown;
  result: unknown;
  valid: boolean;
}>;

export type FindWorkEvent = (
  idempotencyKey: string,
) => Promise<StoredWorkEvent | null>;

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

export type WorkEventInput = Readonly<{
  locationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion?: number;
  idempotencyKey: string;
  payload?: Readonly<Record<string, unknown>>;
  idempotency: Readonly<{
    command: WorkEventCommandIdentity;
    result: Readonly<Record<string, unknown>>;
  }>;
}>;

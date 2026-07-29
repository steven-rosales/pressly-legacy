import type {
  ProductionFloorMilestone,
  ProductionFloorProgressTarget,
  ProductionPendingOrder,
  ProductionOrderRouteReason,
  ProductionStageCompletionTiming,
  ProductionStageNextAction,
  ProductionStageStartTiming,
} from '@pressly/contracts';

export type OrderDemandPhase =
  | 'expected'
  | 'inbound'
  | 'production_released'
  | 'post_production'
  | 'withdrawn';

export type PolicyDecision<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{ code: string; message: string }>;
    }>;

export type ProductionShiftLifecycleDecision = Readonly<{
  from: 'open' | 'closed';
  state: 'open' | 'closed';
}>;

export type ScheduleRevisionLifecycleDecision = Readonly<{
  from: 'draft' | 'accepted' | 'superseded' | 'rejected';
  state: 'draft' | 'accepted' | 'superseded' | 'rejected';
}>;

export type ScheduleSupersessionDecision = Readonly<{
  scheduleRunId: string;
  lifecycle: ScheduleRevisionLifecycleDecision;
}>;

export type ProductionRunLifecycleDecision = Readonly<{
  from: 'started' | 'completed';
  state: 'started' | 'completed';
}>;

export type ProductionBatchLifecycleState =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

export type ProductionBatchLifecycleDecision = Readonly<{
  from: ProductionBatchLifecycleState;
  state: ProductionBatchLifecycleState;
}>;

export type ProductionOrderExecutionState =
  | 'unassigned'
  | 'scheduled'
  | 'finished';

export type ProductionOrderExecutionLifecycleDecision = Readonly<{
  from: ProductionOrderExecutionState;
  state: ProductionOrderExecutionState;
}>;

export type ProductionOrderResolutionState =
  | 'open'
  | 'resolved_without_production';

export type ProductionOrderResolutionLifecycleDecision = Readonly<{
  from: ProductionOrderResolutionState;
  state: ProductionOrderResolutionState;
}>;

export type ProductionOrderResolutionReviewReason =
  | 'intake_recorded'
  | 'manual_admission'
  | 'priority'
  | 'pending_placement';

export type ProductionOrderResolutionBlockReason =
  | 'execution_committed'
  | 'selected_for_shift'
  | 'batch_membership_exists'
  | 'stage_attempt_exists'
  | 'route_exists';

export type ProductionOrderResolutionGuardDecision =
  | Readonly<{
      status: 'allowed';
      requiresExplicitReview: boolean;
      reviewReasons: readonly ProductionOrderResolutionReviewReason[];
      mayClearPendingPlacement: boolean;
    }>
  | Readonly<{
      status: 'blocked';
      blockReasons: readonly ProductionOrderResolutionBlockReason[];
    }>;

export type ProductionOrderSchedulingMutation = Readonly<{
  productionOrderId: string;
  persistedState: ProductionOrderExecutionState;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'unassigned';
    state: 'scheduled';
  }>;
}>;

export type ProductionOrderTerminalExecutionMutation = Readonly<{
  productionOrderId: string;
  persistedState: ProductionOrderExecutionState;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'scheduled';
    state: 'finished';
  }>;
}>;

export type ProductionOrderStageAttemptState =
  | 'assigned'
  | 'completed'
  | 'released';

export type ProductionOrderStageAttemptLifecycleDecision = Readonly<{
  from: ProductionOrderStageAttemptState;
  state: ProductionOrderStageAttemptState;
}>;

export type ProductionOrderStageAttemptMutation = Readonly<{
  attemptId: string;
  stageRunId: string;
  lifecycle: ProductionOrderStageAttemptLifecycleDecision;
}>;

export type ProductionTerminalLifecycleDecisions = Readonly<{
  run: ProductionRunLifecycleDecision;
  shift: ProductionShiftLifecycleDecision;
  orders: readonly ProductionOrderTerminalExecutionMutation[];
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

export type OrderRoutingRejectionCode =
  | 'ORDER_WEIGHT_INVALID'
  | 'SOURCE_BATCH_INVALID'
  | 'QUEUED_REBATCH_SOURCE_NOT_QUEUED'
  | 'QUEUED_REBATCH_SOURCE_FROZEN'
  | 'EXCEPTION_SOURCE_NOT_IN_FLIGHT'
  | 'SOURCE_CURRENT_STAGE_MISMATCH'
  | 'RESTART_STAGE_SKIPS_REQUIRED_WORK'
  | 'TARGET_STAGE_GRAPH_INVALID'
  | 'NO_LATER_TARGET'
  | 'NO_FEASIBLE_TARGET'
  | 'HARD_CAPACITY_EXCEEDED';

export type OrderRoutingPolicyDecision =
  | Readonly<{
      decision: 'rejected';
      command: OrderRoutingPolicyInput['command'];
      reason: Readonly<{
        code: OrderRoutingRejectionCode;
        message: string;
      }>;
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

export type QueuedMoveTargetPolicyDecision =
  | Readonly<{ decision: 'allowed' }>
  | Readonly<{
      decision: 'blocked';
      code:
        | 'TARGET_IS_SOURCE_BATCH'
        | 'TARGET_NOT_QUEUED'
        | 'TARGET_MEMBERSHIP_FROZEN'
        | 'TARGET_STAGE_GRAPH_INVALID'
        | 'TARGET_STAGE_NOT_PLANNED'
        | 'HARD_CAPACITY_EXCEEDED';
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
  initialProductionShiftState: 'open';
  evaluateProductionShiftTransition: (input: {
    state: string;
    event: 'close_after_execution';
  }) => PolicyDecision<ProductionShiftLifecycleDecision>;
  allowedProductionShiftEvents: (
    state: string,
  ) => readonly 'close_after_execution'[];
  initialScheduleRevisionState: 'draft';
  evaluateScheduleRevisionTransition: (input: {
    state: string;
    event: 'accept' | 'supersede' | 'reject';
  }) => PolicyDecision<ScheduleRevisionLifecycleDecision>;
  allowedScheduleRevisionEvents: (
    state: string,
  ) => readonly ('accept' | 'supersede' | 'reject')[];
  initialProductionRunState: 'started';
  evaluateProductionRunTransition: (input: {
    state: string;
    event: 'complete_final_batch';
  }) => PolicyDecision<ProductionRunLifecycleDecision>;
  allowedProductionRunEvents: (
    state: string,
  ) => readonly 'complete_final_batch'[];
  initialProductionBatchState: 'queued';
  evaluateProductionBatchTransition: (input: {
    state: string;
    event:
      | 'start_sorting'
      | 'start_washing'
      | 'start_drying'
      | 'start_folding_packaging'
      | 'finish'
      | 'reconcile_to_sorting'
      | 'reconcile_to_washing'
      | 'reconcile_to_drying'
      | 'reconcile_to_folding_packaging'
      | 'reconcile_to_finished';
  }) => PolicyDecision<ProductionBatchLifecycleDecision>;
  initialProductionOrderExecutionState: 'unassigned';
  resolveProductionOrderExecutionState: (input: {
    executionState: string | null | undefined;
    operationalStatus: string;
  }) => PolicyDecision<ProductionOrderExecutionState>;
  evaluateProductionOrderExecutionTransition: (input: {
    state: string;
    event: 'schedule_or_place' | 'finish_with_batch';
  }) => PolicyDecision<ProductionOrderExecutionLifecycleDecision>;
  initialProductionOrderResolutionState: 'open';
  evaluateProductionOrderResolutionTransition: (input: {
    state: string;
    event: 'resolve_without_production' | 'restore';
  }) => PolicyDecision<ProductionOrderResolutionLifecycleDecision>;
  evaluateProductionOrderOperationalAccess: (input: {
    resolutionState: string;
  }) => PolicyDecision<Readonly<{ resolutionState: 'open' }>>;
  evaluateProductionOrderResolutionGuard: (input: {
    executionState: ProductionOrderExecutionState;
    hasShiftSelection: boolean;
    hasBatchMembership: boolean;
    hasStageAttempt: boolean;
    hasRoute: boolean;
    hasIntake: boolean;
    hasManualAdmission: boolean;
    isPriority: boolean;
    hasPendingPlacement: boolean;
  }) => ProductionOrderResolutionGuardDecision;
  deriveProductionOrderOperationalStatus: (input: {
    executionState: ProductionOrderExecutionState;
    admission: 'unreleased' | 'released' | 'withdrawn' | 'post_production';
    admissionOverride: 'released' | null;
    hasPositiveDemand: boolean;
    bagCount: number | null;
  }) =>
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  initialProductionOrderStageAttemptState: 'assigned';
  evaluateProductionOrderStageAttemptTransition: (input: {
    state: string;
    event: 'complete_with_stage' | 'release_for_route';
  }) => PolicyDecision<ProductionOrderStageAttemptLifecycleDecision>;
  initialProductionStageState: 'planned';
  evaluateProductionAdmission: (input: {
    target: 'released' | 'source';
    sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
    productionStatus:
      | 'release_pending'
      | 'intake_pending'
      | 'eligible'
      | 'ineligible'
      | 'scheduled'
      | 'finished';
    admissionOverride: 'released' | null;
    bagCount: number | null;
    selectedForShift: boolean;
    hasActivePlacement: boolean;
  }) =>
    | Readonly<{
        tag: 'ok';
        value: Readonly<{
          admissionOverride: 'released' | null;
          productionStatus: 'release_pending' | 'intake_pending' | 'eligible';
        }>;
      }>
    | Readonly<{
        tag: 'err';
        error: Readonly<{ code: string; message: string }>;
      }>;
  allowedProductionAdmissionActions: (input: {
    sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
    productionStatus:
      | 'release_pending'
      | 'intake_pending'
      | 'eligible'
      | 'ineligible'
      | 'scheduled'
      | 'finished';
    admissionOverride: 'released' | null;
    bagCount: number | null;
    selectedForShift: boolean;
    hasActivePlacement: boolean;
  }) => readonly ('release' | 'return_to_source')[];
  evaluateDemandLifecycle: (input: {
    phase: OrderDemandPhase;
    productionStatus:
      | 'release_pending'
      | 'intake_pending'
      | 'eligible'
      | 'ineligible'
      | 'scheduled'
      | 'finished'
      | null;
    currentBagCount: number | null;
    estimatedWeightLbs: number | null;
  }) => Readonly<{
    canonicalBagCount: number | null;
    production:
      | Readonly<{ action: 'none' }>
      | Readonly<{ action: 'preserve' }>
      | Readonly<{
          action: 'create' | 'update';
          status:
            | 'release_pending'
            | 'intake_pending'
            | 'eligible'
            | 'ineligible';
        }>;
  }>;
  evaluateOrderRouting: (
    input: OrderRoutingPolicyInput,
  ) => OrderRoutingPolicyDecision;
  evaluateQueuedMoveTarget: (input: {
    sourceProductionBatchId: string;
    orderWeightLbs: number;
    target: OrderRoutingPolicyInput['targetCandidates'][number];
  }) => QueuedMoveTargetPolicyDecision;
  evaluateIntakeAdmission: (input: {
    phase: OrderDemandPhase;
    derivedWeightLbs: number;
    bagCount: number | null;
  }) => PolicyDecision<Readonly<{ status: 'release_pending' | 'eligible' }>>;
  evaluateScheduleAcceptance: (input: {
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
  ) => PolicyDecision<
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

export type DemandForecastInput = Readonly<{
  demand: readonly Readonly<{
    id: string;
    dueAt: string;
    priority: boolean;
    estimatedWeightLbs: number;
    disposition: 'expected' | 'ready';
  }>[];
  machines: SchedulingInput['machines'];
  shift: Pick<
    SchedulingInput['shift'],
    'startsAt' | 'timezone' | 'effectiveFolderCount'
  >;
  config: Pick<
    SchedulingInput['config'],
    'pulseMinutes' | 'foldLbsPerFolderMinute'
  >;
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

export type ProductionRunPlacementContext = Readonly<{
  input: Pick<OnlinePlacementInput, 'run' | 'machines' | 'batches'>;
  runStatus: string;
  batchVersions: Readonly<Record<string, number>>;
  assignedOrderIds: readonly string[];
}>;

export type ProductionOrderPlacementContext = Readonly<{
  input: OnlinePlacementInput;
  runStatus: string;
  orderStatus: string;
  orderExecutionStatus: string;
  orderVersion: number;
  orderAlreadyAssigned: boolean;
  batchVersions: Readonly<Record<string, number>>;
}>;

export type ProductionLiveRunPlacementOrder = Readonly<{
  order: ProductionPendingOrder;
  context: ProductionOrderPlacementContext;
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

export type RemainingDayForecastInput = Readonly<{
  activeRuns: readonly Readonly<{
    run: OnlinePlacementInput['run'];
    machines: OnlinePlacementInput['machines'];
    batches: OnlinePlacementInput['batches'];
  }>[];
  readyOrders: readonly Readonly<{
    id: string;
    dueAt: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>[];
}>;

export type RemainingDayForecastDecision = Readonly<{
  productionOrderId: string;
  disposition: 'ready_to_place' | 'needs_shift';
  reason:
    | 'no_active_run'
    | 'ambiguous_active_run'
    | 'placement_rejected'
    | 'current_run_window_exceeded'
    | null;
}>;

export type RemainingDayForecastOutput = Readonly<{
  algorithmVersion: 'online-stable-insertion-v1';
  decisions: readonly RemainingDayForecastDecision[];
}>;

export type RemainingDayForecastSchedulerPort = Readonly<{
  projectRemainingDayForecast: (
    input: RemainingDayForecastInput,
  ) => RemainingDayForecastOutput;
}>;

export type ProductionSchedulerPort = Readonly<{
  forecastDemand: (input: DemandForecastInput) => DemandForecastOutput;
  propose: (input: SchedulingInput) => SchedulingOutput;
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
}>;

export type ProductionApplicationSchedulerPort = ProductionSchedulerPort &
  RemainingDayForecastSchedulerPort;

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

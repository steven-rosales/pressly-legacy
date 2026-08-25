export type AdvanceStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type AdvanceStageState = 'planned' | 'started' | 'completed';

export type AdvanceStageBatchState =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

export type AdvanceStageAttemptState = 'assigned' | 'completed' | 'released';

export type AdvanceStageOrderExecutionState =
  | 'unassigned'
  | 'scheduled'
  | 'finished';

export type AdvanceStageTimingConfirmation = Readonly<{
  observedAt: string;
  confirmationHash: string;
}>;

type AdvanceStageCommandScope = Readonly<{
  locationId: string;
  stageRunId: string;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type StartAdvanceStageCommand = AdvanceStageCommandScope &
  Readonly<{
    transition: 'start';
    confirmation?: AdvanceStageTimingConfirmation;
  }>;

export type CompleteAdvanceStageCommand = AdvanceStageCommandScope &
  Readonly<{
    transition: 'complete';
    confirmation?: AdvanceStageTimingConfirmation;
  }>;

export type AdvanceStageCommand =
  | StartAdvanceStageCommand
  | CompleteAdvanceStageCommand;

export type AdvanceStageFacts = Readonly<{
  stage: Readonly<{
    id: string;
    productionBatchId: string;
    stage: AdvanceStageKind;
    status: AdvanceStageState;
    plannedStartAt: string;
    plannedEndAt: string;
    actualStartAt: string | null;
    machineIds: readonly string[];
    version: number;
  }>;
  batch: Readonly<{
    id: string;
    status: AdvanceStageBatchState;
    version: number;
  }>;
  attempts: readonly Readonly<{
    id: string;
    status: AdvanceStageAttemptState;
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

export type AdvanceStageStartTiming = Readonly<{
  plannedStartAt: string;
  plannedEndAt: string;
  observedAt: string;
  remainingMilliseconds: number;
}>;

export type AdvanceStageCompletionTiming = Readonly<{
  actualStartAt: string;
  plannedEndAt: string;
  completionBoundaryAt: string;
  observedAt: string;
  plannedDurationMilliseconds: number;
  elapsedMilliseconds: number;
  remainingMilliseconds: number;
}>;

type AdvanceStageConfirmationRequiredResult = Readonly<{
  status: 'confirmation_required';
  stageRunId: string;
  stageVersion: number;
  message: string;
  confirmation: AdvanceStageTimingConfirmation;
  replayed: false;
}>;

export type AdvanceStageStartConfirmationRequired =
  AdvanceStageConfirmationRequiredResult &
    Readonly<{
      code: 'PLANNED_START_NOT_REACHED';
      timing: AdvanceStageStartTiming;
    }>;

export type AdvanceStageCompletionConfirmationRequired =
  AdvanceStageConfirmationRequiredResult &
    Readonly<{
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      timing: AdvanceStageCompletionTiming;
    }>;

export type AdvanceStageConfirmationRequired =
  | AdvanceStageStartConfirmationRequired
  | AdvanceStageCompletionConfirmationRequired;

export type AdvanceStageMutationResult = Readonly<{
  entityId: string;
  version: number;
  replayed: boolean;
}>;

export type AdvanceStageResult =
  | AdvanceStageMutationResult
  | AdvanceStageConfirmationRequired;

type PolicyFailure = Readonly<{ code: string; message: string }>;

type PolicyResult<Value> =
  | Readonly<{ tag: 'ok'; value: Value }>
  | Readonly<{ tag: 'err'; error: PolicyFailure }>;

export type AdvanceStageBatchLifecycle = Readonly<{
  from: AdvanceStageBatchState;
  state: AdvanceStageBatchState;
}>;

export type AdvanceStageAttemptLifecycle = Readonly<{
  from: AdvanceStageAttemptState;
  state: AdvanceStageAttemptState;
}>;

export type AdvanceStageAttemptMutation = Readonly<{
  attemptId: string;
  stageRunId: string;
  lifecycle: AdvanceStageAttemptLifecycle;
}>;

export type AdvanceStageOrderExecutionLifecycle = Readonly<{
  from: AdvanceStageOrderExecutionState;
  state: AdvanceStageOrderExecutionState;
}>;

export type AdvanceStageOrderTerminalMutation = Readonly<{
  productionOrderId: string;
  persistedState: AdvanceStageOrderExecutionState;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'scheduled';
    state: 'finished';
  }>;
}>;

export type AdvanceStageTerminalLifecycle = Readonly<{
  run: Readonly<{
    from: 'started';
    state: 'completed';
  }>;
  shift: Readonly<{
    from: 'open';
    state: 'closed';
  }>;
  orders: readonly AdvanceStageOrderTerminalMutation[];
}>;

type AdvanceStagePolicyTransition =
  | Readonly<{
      status: 'allowed';
      from: AdvanceStageState;
      state: AdvanceStageState;
    }>
  | Readonly<{
      status: 'confirmation_required';
      action: 'start';
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      timing: AdvanceStageStartTiming;
    }>
  | Readonly<{
      status: 'confirmation_required';
      action: 'complete';
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      timing: AdvanceStageCompletionTiming;
    }>;

type ConfirmationIdentity = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
}>;

export type AdvanceStagePolicy = Readonly<{
  evaluateProductionOrderOperationalAccess: (input: {
    resolutionState: string;
  }) => PolicyResult<unknown>;
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
  ) => PolicyResult<AdvanceStagePolicyTransition>;
  evaluateMachineAssignment: (input: {
    stageKind: string;
    batchWeightLbs: number;
    machines: AdvanceStageFacts['machines'];
  }) => PolicyResult<unknown>;
  evaluateProductionBatchTransition: (input: {
    state: string;
    event:
      | 'start_sorting'
      | 'start_washing'
      | 'start_drying'
      | 'start_folding_packaging'
      | 'finish';
  }) => PolicyResult<AdvanceStageBatchLifecycle>;
  evaluateProductionOrderStageAttemptTransition: (input: {
    state: string;
    event: 'complete_with_stage';
  }) => PolicyResult<AdvanceStageAttemptLifecycle>;
  resolveProductionOrderExecutionState: (input: {
    executionState: string;
    operationalStatus: string;
  }) => PolicyResult<AdvanceStageOrderExecutionState>;
  evaluateProductionOrderExecutionTransition: (input: {
    state: string;
    event: 'finish_with_batch';
  }) => PolicyResult<AdvanceStageOrderExecutionLifecycle>;
  evaluateProductionRunTransition: (input: {
    state: string;
    event: 'complete_final_batch';
  }) => PolicyResult<Readonly<{ from: string; state: string }>>;
  evaluateProductionShiftTransition: (input: {
    state: string;
    event: 'close_after_execution';
  }) => PolicyResult<Readonly<{ from: string; state: string }>>;
  makeStageStartConfirmationRequired: (
    input: ConfirmationIdentity &
      Readonly<{
        code: 'PLANNED_START_NOT_REACHED';
        message: string;
        timing: AdvanceStageStartTiming;
      }>,
  ) => AdvanceStageStartConfirmationRequired;
  matchesStageStartConfirmation: (
    input: ConfirmationIdentity &
      Readonly<{
        timing: AdvanceStageStartTiming;
        now: Date;
        confirmation: AdvanceStageTimingConfirmation;
      }>,
  ) => boolean;
  makeStageCompletionConfirmationRequired: (
    input: ConfirmationIdentity &
      Readonly<{
        code: 'PULSE_BOUNDARY_NOT_REACHED';
        message: string;
        timing: AdvanceStageCompletionTiming;
      }>,
  ) => AdvanceStageCompletionConfirmationRequired;
  matchesStageCompletionConfirmation: (
    input: ConfirmationIdentity &
      Readonly<{
        timing: AdvanceStageCompletionTiming;
        now: Date;
        confirmation: AdvanceStageTimingConfirmation;
      }>,
  ) => boolean;
}>;

export type AdvanceStageInvariantFailure = Readonly<{
  code: string;
  message: string;
  safeMessage: string;
}>;

export type AdvanceStageExpectedFailure = AdvanceStageInvariantFailure &
  Readonly<{ kind: 'not_found' | 'conflict' }>;

export type AdvanceStageRejection =
  | Readonly<{
      kind: 'expected';
      failure: AdvanceStageExpectedFailure;
    }>
  | Readonly<{
      kind: 'invariant';
      failure: AdvanceStageInvariantFailure;
    }>;

export type AdvanceStageEarlyStartAudit = Readonly<{
  actorId: string;
  confirmationHash: string;
  confirmationObservedAt: string;
  confirmedAt: string;
  plannedStartAt: string;
  plannedEndAt: string;
  remainingMilliseconds: number;
}>;

export type AdvanceStageEarlyCompletionAudit = Readonly<{
  actorId: string;
  confirmationHash: string;
  confirmationObservedAt: string;
  confirmedAt: string;
  actualStartAt: string;
  plannedEndAt: string;
  completionBoundaryAt: string;
  plannedDurationMilliseconds: number;
  elapsedMilliseconds: number;
  remainingMilliseconds: number;
}>;

export type AdvanceStageCommitPlan = Readonly<{
  eventType: 'stage_started' | 'stage_completed';
  stageLifecycle: Readonly<{
    from: 'planned' | 'started';
    state: 'started' | 'completed';
  }>;
  batchId: string;
  batchExpectedVersion: number;
  batchState: AdvanceStageBatchState;
  batchLifecycle: AdvanceStageBatchLifecycle | null;
  freezeMembership: boolean;
  attemptLifecycles: readonly AdvanceStageAttemptMutation[];
  terminalLifecycle: AdvanceStageTerminalLifecycle | null;
  audit: Readonly<{
    earlyStart?: AdvanceStageEarlyStartAudit;
    earlyCompletion?: AdvanceStageEarlyCompletionAudit;
  }>;
}>;

export type AdvanceStageDecision =
  | Readonly<{ kind: 'reject'; rejection: AdvanceStageRejection }>
  | Readonly<{
      kind: 'confirmation';
      result: AdvanceStageConfirmationRequired;
    }>
  | Readonly<{ kind: 'commit'; plan: AdvanceStageCommitPlan }>;

export type DecideAdvanceStageInput = Readonly<{
  facts: AdvanceStageFacts | null;
  command: AdvanceStageCommand;
  now: Date;
  policy: AdvanceStagePolicy;
}>;

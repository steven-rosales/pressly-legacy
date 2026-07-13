export type PolicyDecision<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{ code: string; message: string }>;
    }>;

export type ProductionPolicyPort = Readonly<{
  evaluateEligibility: (input: {
    state: 'ready_for_production' | 'not_ready';
    derivedWeightLbs: number;
    bagCount: number | null;
  }) => PolicyDecision<Readonly<{ eligible: true }>>;
  evaluateScheduleAcceptance: (input: {
    status: string;
    expectedOutputPlanHash: string;
    actualOutputPlanHash: string;
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
  ) => PolicyDecision<Readonly<{ state: 'planned' | 'started' | 'completed' }>>;
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
    algorithmVersion: 'fixed-pulse-ffd-v1';
    version: number;
  }>;
  horizonEnd: string;
}>;

export type SchedulingOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-ffd-v1';
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

export type ProductionSchedulerPort = Readonly<{
  propose: (input: SchedulingInput) => SchedulingOutput;
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

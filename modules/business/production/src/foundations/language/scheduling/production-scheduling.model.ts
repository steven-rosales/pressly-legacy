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

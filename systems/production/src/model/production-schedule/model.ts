export type ScheduleAlgorithmVersion =
  | 'fixed-pulse-ffd-v1'
  | 'fixed-pulse-ffd-v2';

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

export type ScheduleWarningCode =
  | 'SHIFT_OVERFLOW'
  | 'OVERSIZED_ORDER'
  | 'NO_ACTIVE_WASHERS'
  | 'NO_ACTIVE_DRYERS'
  | 'NO_FOLDING_CAPACITY';

export type PlannedStage = Readonly<{
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;

export type ProposedScheduleBatch = Readonly<{
  sequence: number;
  orderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly PlannedStage[];
}>;

export type ScheduleWarning = Readonly<{
  code: ScheduleWarningCode;
  message: string;
  blocking: boolean;
  orderIds?: readonly string[];
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
  batches: readonly ProposedScheduleBatch[];
  unplacedOrderIds: readonly string[];
  warnings: readonly ScheduleWarning[];
}>;

export type ScheduleProposal = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  status: 'draft' | 'accepted' | 'superseded' | 'rejected';
  inputSnapshotHash: string;
  outputPlanHash: string;
  algorithmVersion: ScheduleAlgorithmVersion;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly ProposedScheduleBatch[];
  unplacedOrderIds: readonly string[];
  warnings: readonly ScheduleWarning[];
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
  supersededAt: string | null;
}>;

export type ProposeSchedule = (input: SchedulingInput) => SchedulingOutput;

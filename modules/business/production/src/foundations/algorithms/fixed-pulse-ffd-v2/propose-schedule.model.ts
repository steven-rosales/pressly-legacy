export type SchedulingStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type SchedulingOrder = Readonly<{
  id: string;
  externalOrderId: string;
  dueAt: string;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type SchedulingMachine = Readonly<{
  id: string;
  stationKind: 'washing' | 'drying';
  effectiveCapacityLbs: number;
  active: boolean;
}>;

export type SchedulingInput = Readonly<{
  orders: readonly SchedulingOrder[];
  machines: readonly SchedulingMachine[];
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

export type SchedulingWarning = Readonly<{
  code:
    | 'SHIFT_OVERFLOW'
    | 'OVERSIZED_ORDER'
    | 'NO_ACTIVE_WASHERS'
    | 'NO_ACTIVE_DRYERS'
    | 'NO_FOLDING_CAPACITY';
  message: string;
  blocking: boolean;
  orderIds?: readonly string[];
}>;

export type ProposedStage = Readonly<{
  stage: SchedulingStageKind;
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;

export type SchedulingBatch = Readonly<{
  sequence: number;
  orderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly ProposedStage[];
}>;

export type SchedulingProposal = Readonly<{
  algorithmVersion: 'fixed-pulse-ffd-v2';
  inputSnapshotHash: string;
  outputPlanHash: string;
  canonicalOutput: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly SchedulingBatch[];
  unplacedOrderIds: readonly string[];
  warnings: readonly SchedulingWarning[];
}>;

export type ProposeSchedule = (input: SchedulingInput) => SchedulingProposal;

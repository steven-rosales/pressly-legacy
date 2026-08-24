import type {
  ProductionRules,
  ScheduleRevisionLifecycleDecision,
} from '../../../model/public.ts';

export type ScheduleWarningCode =
  | 'SHIFT_OVERFLOW'
  | 'OVERSIZED_ORDER'
  | 'NO_ACTIVE_WASHERS'
  | 'NO_ACTIVE_DRYERS'
  | 'NO_FOLDING_CAPACITY';

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

export type ProposedScheduleBatch = Readonly<{
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
}>;

export type ScheduleWarning = Readonly<{
  code: ScheduleWarningCode;
  message: string;
  blocking: boolean;
  orderIds?: readonly string[] | undefined;
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
  algorithmVersion: 'fixed-pulse-ffd-v1' | 'fixed-pulse-ffd-v2';
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

export type ScheduleAcceptanceRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
}>;

export type AcceptScheduleCommand = Readonly<{
  locationId: string;
  scheduleRunId: string;
  expectedOutputPlanHash: string;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
  idempotencyKey: string;
  actorId: string;
}>;

export type AcceptScheduleResult = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  acceptedAt: string;
  replayed: boolean;
}>;

type Failure<Kind extends string, Code extends string> = Readonly<{
  kind: Kind;
  code: Code;
  message: string;
  safeMessage: string;
}>;

export type AcceptScheduleNotFoundFailure = Failure<
  'not_found',
  'schedule_not_found'
>;

export type AcceptScheduleConflictCode =
  | 'production_idempotency_conflict'
  | 'production_shift_window_invalid'
  | 'production_shift_expired'
  | 'production_shift_already_started'
  | 'schedule_not_draft'
  | 'schedule_hash_mismatch'
  | 'schedule_warning_acknowledgement_invalid'
  | 'schedule_warning_not_acknowledged'
  | 'schedule_has_no_batches'
  | 'batch_capacity_exceeded'
  | 'batch_stage_count_invalid'
  | 'batch_has_no_orders'
  | 'batch_stage_order_invalid'
  | 'stage_pulse_mismatch'
  | 'batch_stage_gap_invalid'
  | 'order_split_across_batches'
  | 'schedule_not_current'
  | 'schedule_input_snapshot_stale'
  | 'production_schedule_already_accepted';

export type AcceptScheduleConflictFailure = Failure<
  'conflict',
  AcceptScheduleConflictCode
>;

export type AcceptScheduleExpectedFailure =
  | AcceptScheduleNotFoundFailure
  | AcceptScheduleConflictFailure;

export type AcceptSchedulePolicy = Pick<
  ProductionRules,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleRevisionTransition'
  | 'evaluateScheduleAcceptance'
  | 'evaluateCurrentPlanAcceptance'
>;

export type AcceptScheduleWindowDecision =
  | Readonly<{ kind: 'continue' }>
  | Readonly<{ kind: 'reject'; failure: AcceptScheduleConflictFailure }>;

export type AcceptScheduleProposalDecision =
  | Readonly<{
      kind: 'continue';
      lifecycle: ScheduleRevisionLifecycleDecision;
    }>
  | Readonly<{ kind: 'reject'; failure: AcceptScheduleConflictFailure }>;

export type AcceptScheduleSnapshotDecision =
  | Readonly<{ kind: 'accept' }>
  | Readonly<{ kind: 'reject'; failure: AcceptScheduleConflictFailure }>;

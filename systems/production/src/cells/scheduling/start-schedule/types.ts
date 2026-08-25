import type {
  ProductionOrderSchedulingMutation,
  ProductionRules,
} from '../../../model/public.ts';
import type {
  ProposedScheduleBatch,
  ScheduleWarningCode,
  SchedulingInput,
} from '../../../model/production-schedule/model.ts';

export type StartScheduleCommand = Readonly<{
  locationId: string;
  scheduleRunId: string;
  expectedOutputPlanHash: string;
  idempotencyKey: string;
  actorId: string;
}>;

export type StartScheduleResult = Readonly<{
  scheduleRunId: string;
  productionRunId: string;
  productionBatchIds: readonly string[];
  queueVersion: number;
  startedAt: string;
  replayed: boolean;
}>;

export type ScheduleStartPlan = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  status: string;
  outputPlanHash: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  plannedCompletionAt: string;
  batches: readonly ProposedScheduleBatch[];
  unplacedOrderIds: readonly string[];
}>;

export type ScheduleStartRecord = Readonly<{
  schedule: ScheduleStartPlan;
  inputSnapshot: SchedulingInput;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
}>;

export type StartScheduleOrder = Readonly<{
  id: string;
  operationalStatus: string;
  executionStatus: string;
  version: number;
}>;

export type StartSchedulePolicy = Pick<
  ProductionRules,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleStart'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderExecutionTransition'
  | 'initialProductionRunState'
  | 'initialProductionBatchState'
  | 'initialProductionStageState'
  | 'initialProductionOrderStageAttemptState'
>;

export type StartScheduleDecision = Readonly<{
  orderLifecycles: readonly ProductionOrderSchedulingMutation[];
  productionRunStatus: 'started';
  initialBatchState: 'queued';
  initialStageState: 'planned';
  initialAttemptState: 'assigned';
}>;

type Failure<Kind extends string, Code extends string> = Readonly<{
  kind: Kind;
  code: Code;
  message: string;
  safeMessage: string;
}>;

export type StartScheduleNotFoundFailure = Failure<
  'not_found',
  'schedule_not_found' | 'production_shift_not_found'
>;

export type StartScheduleConflictFailure = Failure<
  'conflict',
  | 'production_idempotency_conflict'
  | 'schedule_hash_mismatch'
  | 'production_shift_window_invalid'
  | 'production_shift_expired'
  | 'production_shift_not_started'
  | 'schedule_not_accepted'
  | 'schedule_not_current'
  | 'schedule_input_snapshot_stale'
  | 'production_run_already_exists'
  | 'schedule_has_no_batches'
  | 'schedule_input_stale'
  | 'production_order_execution_state_invalid'
  | 'production_order_execution_event_not_allowed'
  | 'production_order_execution_transition_invalid'
  | 'production_schedule_start_order_version_conflict'
>;

export type StartScheduleExpectedFailure =
  | StartScheduleNotFoundFailure
  | StartScheduleConflictFailure;

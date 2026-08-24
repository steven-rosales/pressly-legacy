import type {
  ProductionRules,
  ScheduleRevisionLifecycleDecision,
} from '../../../model/public.ts';
import type { ProposeSchedule } from '../../../model/production-schedule/model.ts';

export type CreateScheduleCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  idempotencyKey: string;
  actorId: string;
}>;
export type CreateSchedulePolicy = Pick<
  ProductionRules,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleRevisionTransition'
  | 'initialScheduleRevisionState'
>;
export type CreateScheduleScheduler = Readonly<{
  propose: ProposeSchedule;
}>;
export type CurrentSchedule = Readonly<{
  scheduleRunId: string;
  status: string;
}>;
export type ScheduleSupersession = Readonly<{
  scheduleRunId: string;
  lifecycle: ScheduleRevisionLifecycleDecision;
}>;

type Failure<Kind extends string, Code extends string> = Readonly<{
  kind: Kind;
  code: Code;
  message: string;
  safeMessage: string;
}>;
export type CreateScheduleNotFoundFailure = Failure<
  'not_found',
  'production_shift_not_found' | 'scheduling_input_not_found'
>;
export type CreateScheduleConflictFailure = Failure<
  'conflict',
  | 'production_idempotency_conflict'
  | 'production_shift_already_started'
  | 'schedule_selection_empty'
  | 'schedule_selection_not_ready'
  | 'production_shift_window_invalid'
  | 'production_shift_expired'
  | 'schedule_current_plan_state_invalid'
  | 'production_schedule_revision_version_conflict'
>;
export type CreateScheduleExpectedFailure =
  | CreateScheduleNotFoundFailure
  | CreateScheduleConflictFailure;

import {
  currentPlanInvalid,
  planningWindowFailure,
  schedulingInputNotFound,
  selectionEmpty,
  selectionNotReady,
  shiftAlreadyStarted,
  shiftNotFound,
} from './failures.ts';
import type { SchedulingInput } from '../../../model/production-schedule/model.ts';
import type {
  CreateScheduleExpectedFailure,
  CreateSchedulePolicy,
  CurrentSchedule,
  ScheduleSupersession,
} from './types.ts';

export const createScheduleOperationId =
  'production.create-schedule.v1' as const;
export const decidePlanningState = (
  state: 'available' | 'not_found' | 'run_exists',
): CreateScheduleExpectedFailure | null =>
  state === 'not_found'
    ? shiftNotFound()
    : state === 'run_exists'
      ? shiftAlreadyStarted()
      : null;
export const decideSchedulingInput = (
  input: SchedulingInput | 'selection_empty' | 'selection_invalid' | null,
):
  | { kind: 'ready'; input: SchedulingInput }
  | { kind: 'reject'; failure: CreateScheduleExpectedFailure } =>
  input === null
    ? { kind: 'reject', failure: schedulingInputNotFound() }
    : input === 'selection_empty'
      ? { kind: 'reject', failure: selectionEmpty() }
      : input === 'selection_invalid'
        ? { kind: 'reject', failure: selectionNotReady() }
        : { kind: 'ready', input };
export const decidePlanningWindow = (input: {
  schedulingInput: SchedulingInput;
  now: Date;
  policy: CreateSchedulePolicy;
}): CreateScheduleExpectedFailure | null => {
  const outcome = input.policy.evaluateShiftPlanningWindow({
    action: 'compute',
    now: input.now,
    startsAt: new Date(input.schedulingInput.shift.startsAt),
    endsAt: new Date(input.schedulingInput.shift.endsAt),
  });
  return outcome.tag === 'err'
    ? planningWindowFailure(outcome.error.code, outcome.error.message)
    : null;
};
export const decideCurrentPlanSupersession = (input: {
  current: CurrentSchedule | null;
  policy: CreateSchedulePolicy;
}):
  | { kind: 'ready'; supersession: ScheduleSupersession | null }
  | { kind: 'reject'; failure: CreateScheduleExpectedFailure } => {
  if (input.current === null) return { kind: 'ready', supersession: null };
  const lifecycle = input.policy.evaluateScheduleRevisionTransition({
    state: input.current.status,
    event: 'supersede',
  });
  if (
    lifecycle.tag === 'err' ||
    (lifecycle.value.from !== 'draft' && lifecycle.value.from !== 'accepted') ||
    lifecycle.value.state !== 'superseded'
  )
    return { kind: 'reject', failure: currentPlanInvalid() };
  return {
    kind: 'ready',
    supersession: {
      scheduleRunId: input.current.scheduleRunId,
      lifecycle: lifecycle.value,
    },
  };
};

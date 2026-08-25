import {
  orderStateInvalid,
  orderTransitionInvalid,
  policyConflict,
  scheduleHashMismatch,
  scheduleInputStale,
  scheduleNotFound,
} from './failures.ts';
import type { ProductionOrderSchedulingMutation } from '../../../model/public.ts';
import type {
  ScheduleStartRecord,
  StartScheduleDecision,
  StartScheduleExpectedFailure,
  StartScheduleOrder,
  StartSchedulePolicy,
} from './types.ts';

export const startScheduleOperationId = 'production.start-schedule.v1' as const;

export const decideScheduleRecord = (input: {
  record: ScheduleStartRecord | null;
  expectedOutputPlanHash: string;
}):
  | Readonly<{ kind: 'ready'; record: ScheduleStartRecord }>
  | Readonly<{ kind: 'reject'; failure: StartScheduleExpectedFailure }> => {
  if (input.record === null)
    return { kind: 'reject', failure: scheduleNotFound() };
  if (input.record.schedule.outputPlanHash !== input.expectedOutputPlanHash)
    return { kind: 'reject', failure: scheduleHashMismatch() };
  return { kind: 'ready', record: input.record };
};

export const decideStartWindow = (input: {
  record: ScheduleStartRecord;
  now: Date;
  policy: StartSchedulePolicy;
}): StartScheduleExpectedFailure | null => {
  const outcome = input.policy.evaluateShiftPlanningWindow({
    action: 'start',
    now: input.now,
    startsAt: new Date(input.record.inputSnapshot.shift.startsAt),
    endsAt: new Date(input.record.inputSnapshot.shift.endsAt),
  });
  return outcome.tag === 'err'
    ? policyConflict(
        outcome.error.code.toLowerCase() as
          | 'production_shift_window_invalid'
          | 'production_shift_expired'
          | 'production_shift_not_started',
        outcome.error.message,
      )
    : null;
};

export const decideStartSchedule = (input: {
  record: ScheduleStartRecord;
  lockedOrders: readonly StartScheduleOrder[] | null;
  productionRunExists: boolean;
  policy: StartSchedulePolicy;
}):
  | Readonly<{ kind: 'ready'; decision: StartScheduleDecision }>
  | Readonly<{ kind: 'reject'; failure: StartScheduleExpectedFailure }> => {
  const schedule = input.record.schedule;
  const start = input.policy.evaluateScheduleStart({
    scheduleRunId: schedule.scheduleRunId,
    status: schedule.status,
    currentScheduleRunId:
      schedule.status === 'accepted' ? schedule.scheduleRunId : null,
    eligibleOrderSnapshotMatches: input.lockedOrders !== null,
    productionRunExists: input.productionRunExists,
    batchCount: schedule.batches.length,
  });
  if (start.tag === 'err')
    return {
      kind: 'reject',
      failure: policyConflict(
        start.error.code.toLowerCase() as
          | 'schedule_not_accepted'
          | 'schedule_not_current'
          | 'schedule_input_snapshot_stale'
          | 'production_run_already_exists'
          | 'schedule_has_no_batches',
        start.error.message,
      ),
    };
  if (input.lockedOrders === null)
    return { kind: 'reject', failure: scheduleInputStale() };

  const orderLifecycles: ProductionOrderSchedulingMutation[] = [];
  for (const order of input.lockedOrders) {
    const resolved = input.policy.resolveProductionOrderExecutionState({
      executionState: order.executionStatus,
      operationalStatus: order.operationalStatus,
    });
    if (resolved.tag === 'err')
      return {
        kind: 'reject',
        failure: policyConflict(
          resolved.error.code.toLowerCase() as
            | 'production_order_execution_state_invalid'
            | 'production_order_execution_event_not_allowed',
          resolved.error.message,
        ),
      };
    const lifecycle = input.policy.evaluateProductionOrderExecutionTransition({
      state: resolved.value,
      event: 'schedule_or_place',
    });
    if (lifecycle.tag === 'err')
      return {
        kind: 'reject',
        failure: policyConflict(
          lifecycle.error.code.toLowerCase() as
            | 'production_order_execution_state_invalid'
            | 'production_order_execution_event_not_allowed',
          lifecycle.error.message,
        ),
      };
    if (
      lifecycle.value.from !== 'unassigned' ||
      lifecycle.value.state !== 'scheduled'
    )
      return { kind: 'reject', failure: orderTransitionInvalid() };
    if (
      order.executionStatus !== 'unassigned' &&
      order.executionStatus !== 'scheduled' &&
      order.executionStatus !== 'finished'
    )
      return { kind: 'reject', failure: orderStateInvalid() };
    orderLifecycles.push({
      productionOrderId: order.id,
      persistedState: order.executionStatus,
      expectedVersion: order.version,
      lifecycle: {
        from: lifecycle.value.from,
        state: lifecycle.value.state,
      },
    });
  }

  return {
    kind: 'ready',
    decision: {
      orderLifecycles,
      productionRunStatus: input.policy.initialProductionRunState,
      initialBatchState: input.policy.initialProductionBatchState,
      initialStageState: input.policy.initialProductionStageState,
      initialAttemptState: input.policy.initialProductionOrderStageAttemptState,
    },
  };
};

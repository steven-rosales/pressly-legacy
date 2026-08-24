import {
  acceptScheduleAlreadyStarted,
  acceptScheduleConflict,
  acceptScheduleNotDraft,
} from './failures.ts';
import type {
  AcceptScheduleCommand,
  AcceptSchedulePolicy,
  AcceptScheduleProposalDecision,
  AcceptScheduleSnapshotDecision,
  AcceptScheduleWindowDecision,
  ScheduleAcceptanceRecord,
  ScheduleProposal,
  SchedulingInput,
} from './types.ts';

export const acceptScheduleOperationId =
  'production.accept-schedule.v1' as const;

export const acceptanceScheduleCoversInputExactly = (
  schedule: Pick<ScheduleProposal, 'batches' | 'unplacedOrderIds'>,
  inputSnapshot: Pick<SchedulingInput, 'orders'>,
): boolean => {
  const snapshotOrderIds = inputSnapshot.orders.map((order) => order.id);
  const plannedOrderIds = [
    ...schedule.batches.flatMap((batch) => batch.orderIds),
    ...schedule.unplacedOrderIds,
  ];

  if (
    new Set(snapshotOrderIds).size !== snapshotOrderIds.length ||
    new Set(plannedOrderIds).size !== plannedOrderIds.length ||
    plannedOrderIds.length !== snapshotOrderIds.length
  )
    return false;

  const snapshotSet = new Set(snapshotOrderIds);
  return plannedOrderIds.every((orderId) => snapshotSet.has(orderId));
};

export const decideAcceptScheduleWindow = (input: {
  record: ScheduleAcceptanceRecord;
  now: Date;
  policy: AcceptSchedulePolicy;
}): AcceptScheduleWindowDecision => {
  const decision = input.policy.evaluateShiftPlanningWindow({
    action: 'accept',
    now: input.now,
    startsAt: new Date(input.record.inputSnapshot.shift.startsAt),
    endsAt: new Date(input.record.inputSnapshot.shift.endsAt),
  });
  return decision.tag === 'ok'
    ? { kind: 'continue' }
    : {
        kind: 'reject',
        failure: acceptScheduleConflict(
          decision.error.code.toLowerCase() as
            | 'production_shift_window_invalid'
            | 'production_shift_expired',
          decision.error.message,
        ),
      };
};

export const decideAcceptScheduleProposal = (input: {
  command: AcceptScheduleCommand;
  schedule: ScheduleProposal;
  productionRunExists: boolean;
  policy: AcceptSchedulePolicy;
}): AcceptScheduleProposalDecision => {
  if (input.productionRunExists)
    return { kind: 'reject', failure: acceptScheduleAlreadyStarted() };

  const lifecycle = input.policy.evaluateScheduleRevisionTransition({
    state: input.schedule.status,
    event: 'accept',
  });
  if (
    lifecycle.tag === 'err' ||
    lifecycle.value.from !== 'draft' ||
    lifecycle.value.state !== 'accepted'
  )
    return { kind: 'reject', failure: acceptScheduleNotDraft() };

  const acceptance = input.policy.evaluateScheduleAcceptance({
    expectedOutputPlanHash: input.command.expectedOutputPlanHash,
    actualOutputPlanHash: input.schedule.outputPlanHash,
    warningCodes: input.schedule.warnings.map((warning) => warning.code),
    blockingWarningCodes: input.schedule.warnings
      .filter((warning) => warning.blocking)
      .map((warning) => warning.code),
    acknowledgedWarningCodes: input.command.acknowledgedWarningCodes,
    batches: input.schedule.batches.map((batch) => ({
      weightLbs: batch.derivedWeightLbs,
      capacityLbs: input.schedule.pulseCapacityLbs,
      orderIds: batch.orderIds,
      stages: batch.stages.map((stage) => ({
        stage: stage.stage,
        startsAt: new Date(stage.startsAt),
        endsAt: new Date(stage.endsAt),
        pulseMinutes: input.schedule.pulseMinutes,
      })),
    })),
  });
  return acceptance.tag === 'ok'
    ? { kind: 'continue', lifecycle: lifecycle.value }
    : {
        kind: 'reject',
        failure: acceptScheduleConflict(
          acceptance.error.code.toLowerCase() as
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
            | 'order_split_across_batches',
          acceptance.error.message,
        ),
      };
};

export const decideAcceptScheduleSnapshot = (input: {
  scheduleRunId: string;
  eligibleOrderSnapshotMatches: boolean;
  policy: AcceptSchedulePolicy;
}): AcceptScheduleSnapshotDecision => {
  const decision = input.policy.evaluateCurrentPlanAcceptance({
    scheduleRunId: input.scheduleRunId,
    currentScheduleRunId: input.scheduleRunId,
    eligibleOrderSnapshotMatches: input.eligibleOrderSnapshotMatches,
  });
  return decision.tag === 'ok'
    ? { kind: 'accept' }
    : {
        kind: 'reject',
        failure: acceptScheduleConflict(
          decision.error.code.toLowerCase() as
            | 'schedule_not_current'
            | 'schedule_input_snapshot_stale',
          decision.error.message,
        ),
      };
};

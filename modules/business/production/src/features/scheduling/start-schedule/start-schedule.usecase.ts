import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type {
  ScheduleStartOrderLifecycle,
  StartSchedule,
  StartScheduleRepository,
} from './start-schedule.port.ts';
import type { StartScheduleResult } from './start-schedule.model.ts';
export type { StartSchedule } from './start-schedule.port.ts';

type StartSchedulePolicy = Pick<
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

export const makeStartSchedule =
  (deps: {
    repo: StartScheduleRepository;
    clock: Clock;
    policy: StartSchedulePolicy;
    signals: ProductionSignalsPort;
  }): StartSchedule =>
  async (command) => {
    let outcome: Awaited<ReturnType<StartSchedule>>;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_run_started',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'schedule_run',
          entityId: command.scheduleRunId,
          payload: { expectedOutputPlanHash: command.expectedOutputPlanHash },
        });
        const replay = resolveWorkEventReplay<StartScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = resolveWorkEventReplay<StartScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (lockedReplay.tag === 'replay')
          return result.ok(lockedReplay.result);

        const record = await repo.loadSchedule(
          command.locationId,
          command.scheduleRunId,
        );
        if (record === null)
          return result.err(
            notFoundFailure({
              code: 'schedule_not_found',
              message: 'The accepted schedule was not found.',
              safeMessage: 'The accepted schedule was not found.',
            }),
          );
        if (record.schedule.outputPlanHash !== command.expectedOutputPlanHash)
          return result.err(
            conflictFailure({
              code: 'schedule_hash_mismatch',
              message:
                'The accepted schedule hash does not match the Start command.',
              safeMessage:
                'The accepted schedule hash does not match the Start command.',
            }),
          );
        if (
          !(await repo.lockShiftForStart(
            command.locationId,
            record.schedule.productionShiftId,
          ))
        )
          return result.err(
            notFoundFailure({
              code: 'production_shift_not_found',
              message: 'The production shift was not found.',
              safeMessage: 'The production shift was not found.',
            }),
          );
        const now = deps.clock.now();
        const shiftWindow = deps.policy.evaluateShiftPlanningWindow({
          action: 'start',
          now,
          startsAt: new Date(record.inputSnapshot.shift.startsAt),
          endsAt: new Date(record.inputSnapshot.shift.endsAt),
        });
        if (shiftWindow.tag === 'err')
          return result.err(
            conflictFailure({
              code: shiftWindow.error.code.toLowerCase(),
              message: shiftWindow.error.message,
              safeMessage: shiftWindow.error.message,
            }),
          );
        const productionRunExists = await repo.productionRunExists(
          command.locationId,
          record.schedule.productionShiftId,
        );
        const lockedOrders = await repo.lockAndLoadStartOrders(
          command.locationId,
          record,
        );
        const startDecision = deps.policy.evaluateScheduleStart({
          scheduleRunId: record.schedule.scheduleRunId,
          status: record.schedule.status,
          currentScheduleRunId:
            record.schedule.status === 'accepted'
              ? record.schedule.scheduleRunId
              : null,
          eligibleOrderSnapshotMatches: lockedOrders !== null,
          productionRunExists,
          batchCount: record.schedule.batches.length,
        });
        if (startDecision.tag === 'err')
          return result.err(
            conflictFailure({
              code: startDecision.error.code.toLowerCase(),
              message: startDecision.error.message,
              safeMessage: startDecision.error.message,
            }),
          );

        if (lockedOrders === null)
          return result.err(
            conflictFailure({
              code: 'schedule_input_stale',
              message:
                'The accepted schedule no longer matches its selected orders.',
              safeMessage:
                'The accepted schedule no longer matches its selected orders.',
            }),
          );
        const orderLifecycles: ScheduleStartOrderLifecycle[] = [];
        for (const order of lockedOrders) {
          const resolved = deps.policy.resolveProductionOrderExecutionState({
            executionState: order.executionStatus,
            operationalStatus: order.operationalStatus,
          });
          if (resolved.tag === 'err')
            return result.err(
              conflictFailure({
                code: resolved.error.code.toLowerCase(),
                message: resolved.error.message,
                safeMessage: resolved.error.message,
              }),
            );
          const lifecycle =
            deps.policy.evaluateProductionOrderExecutionTransition({
              state: resolved.value,
              event: 'schedule_or_place',
            });
          if (lifecycle.tag === 'err')
            return result.err(
              conflictFailure({
                code: lifecycle.error.code.toLowerCase(),
                message: lifecycle.error.message,
                safeMessage: lifecycle.error.message,
              }),
            );
          if (
            lifecycle.value.from !== 'unassigned' ||
            lifecycle.value.state !== 'scheduled'
          )
            return result.err(
              conflictFailure({
                code: 'production_order_execution_transition_invalid',
                message: 'The production order cannot be committed by Start.',
                safeMessage:
                  'The production order cannot be committed by Start.',
              }),
            );
          if (
            order.executionStatus !== 'unassigned' &&
            order.executionStatus !== 'scheduled' &&
            order.executionStatus !== 'finished'
          )
            return result.err(
              conflictFailure({
                code: 'production_order_execution_state_invalid',
                message: 'The production order execution state is invalid.',
                safeMessage: 'The production order execution state is invalid.',
              }),
            );
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

        return result.ok(
          await repo.startSchedule({
            locationId: command.locationId,
            record,
            actorId: command.actorId,
            productionRunStatus: deps.policy.initialProductionRunState,
            orderLifecycles,
            initialBatchState: deps.policy.initialProductionBatchState,
            initialStageState: deps.policy.initialProductionStageState,
            initialAttemptState:
              deps.policy.initialProductionOrderStageAttemptState,
            idempotencyKey: command.idempotencyKey,
            idempotency,
            now,
          }),
        );
      });
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_run_start_failed',
          message: 'Production could not start from the accepted schedule.',
          safeMessage: 'Production could not start from the accepted schedule.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }

    if (outcome.tag === 'ok' && !outcome.value.replayed)
      deps.signals.runStarted();

    return outcome;
  };

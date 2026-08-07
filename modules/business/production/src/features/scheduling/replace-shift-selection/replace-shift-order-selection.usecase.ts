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
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import type { ScheduleSupersessionDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type {
  ReplaceShiftOrderSelection,
  ReplaceShiftOrderSelectionRepository,
} from './replace-shift-order-selection.port.ts';
import type { ReplaceShiftOrderSelectionResult } from './replace-shift-order-selection.model.ts';

const sorted = (values: readonly string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right));

const sameSelection = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const makeReplaceShiftOrderSelection =
  (deps: {
    repo: ReplaceShiftOrderSelectionRepository;
    clock: Clock;
    policy: Pick<ProductionRules, 'evaluateScheduleRevisionTransition'>;
    signals?: ProductionSignalsPort;
  }): ReplaceShiftOrderSelection =>
  async (command) => {
    let superseded = false;
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const selectedOrderIds = sorted(command.selectedOrderIds);
        const idempotency = defineWorkEventCommand({
          operation: 'production_shift_selection_replaced',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          expectedVersion: command.expectedVersion,
          payload: { selectedOrderIds },
        });
        const replay = resolveWorkEventReplay<ReplaceShiftOrderSelectionResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay =
          resolveWorkEventReplay<ReplaceShiftOrderSelectionResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (lockedReplay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (lockedReplay.tag === 'replay')
          return result.ok(lockedReplay.result);

        const current = await repo.lockSelection(
          command.locationId,
          command.productionShiftId,
        );
        if (current.state === 'not_found')
          return result.err(
            notFoundFailure({
              code: 'production_shift_not_found',
              message: 'The production shift was not found.',
              safeMessage: 'The production shift was not found.',
            }),
          );
        if (current.state === 'run_exists')
          return result.err(
            conflictFailure({
              code: 'production_shift_already_started',
              message:
                'The order selection is frozen because production has started.',
              safeMessage:
                'The order selection is frozen because production has started.',
            }),
          );
        if (current.version !== command.expectedVersion)
          return result.err(
            conflictFailure({
              code: 'production_shift_selection_version_conflict',
              message:
                'The shift selection changed. Refresh it before choosing orders again.',
              safeMessage:
                'The shift selection changed. Refresh it before choosing orders again.',
            }),
          );
        if (
          !(await repo.selectedOrdersAreReady(
            command.locationId,
            selectedOrderIds,
          ))
        )
          return result.err(
            conflictFailure({
              code: 'production_shift_selection_not_ready',
              message:
                'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
              safeMessage:
                'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
            }),
          );

        const currentOrderIds = sorted(current.selectedOrderIds);
        let replaced: ReplaceShiftOrderSelectionResult;
        if (sameSelection(currentOrderIds, selectedOrderIds))
          replaced = {
            selection: {
              productionShiftId: command.productionShiftId,
              version: current.version,
              selectedOrderIds,
            },
            supersededScheduleRunId: null,
            replayed: false,
          };
        else {
          let supersede: ScheduleSupersessionDecision | null = null;
          if (current.currentSchedule !== null) {
            const lifecycle = deps.policy.evaluateScheduleRevisionTransition({
              state: current.currentSchedule.status,
              event: 'supersede',
            });
            if (
              lifecycle.tag === 'err' ||
              (lifecycle.value.from !== 'draft' &&
                lifecycle.value.from !== 'accepted') ||
              lifecycle.value.state !== 'superseded'
            )
              return result.err(
                conflictFailure({
                  code: 'schedule_current_plan_state_invalid',
                  message:
                    'The current schedule revision cannot be superseded.',
                  safeMessage:
                    'The current schedule revision cannot be superseded.',
                }),
              );
            supersede = {
              scheduleRunId: current.currentSchedule.scheduleRunId,
              lifecycle: lifecycle.value,
            };
          }
          const saved = await repo.replaceSelection({
            locationId: command.locationId,
            productionShiftId: command.productionShiftId,
            selectedOrderIds,
            currentVersion: current.version,
            supersede,
            actorId: command.actorId,
            now: deps.clock.now(),
          });
          if (saved === null)
            return result.err(
              conflictFailure({
                code: 'production_shift_selection_version_conflict',
                message:
                  'The shift selection changed. Refresh it before choosing orders again.',
                safeMessage:
                  'The shift selection changed. Refresh it before choosing orders again.',
              }),
            );
          replaced = saved;
          superseded = saved.supersededScheduleRunId !== null;
        }

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_selection_replaced',
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            selectedOrderIds,
            version: replaced.selection.version,
            supersededScheduleRunId: replaced.supersededScheduleRunId,
          },
          idempotency: { command: idempotency, result: replaced },
        });
        return result.ok(replaced);
      });
      if (outcome.tag === 'ok' && superseded) deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_shift_selection_failed',
          message: 'The shift order selection could not be saved.',
          safeMessage: 'The shift order selection could not be saved.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

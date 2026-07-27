import type { ReplaceProductionShiftSelectionResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type {
  ClockPort,
  ProductionPolicyPort,
  ScheduleSupersessionDecision,
  ProductionSignalsPort,
} from '../production.port.ts';
import type {
  ReplaceShiftOrderSelection,
  ReplaceShiftOrderSelectionRepository,
} from './replace-shift-order-selection.port.ts';

export type { ReplaceShiftOrderSelection } from './replace-shift-order-selection.port.ts';

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
    clock: ClockPort;
    policy: ProductionPolicyPort;
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
        const replay =
          resolveWorkEventReplay<ReplaceProductionShiftSelectionResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay =
          resolveWorkEventReplay<ReplaceProductionShiftSelectionResult>(
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
            productionError(
              'PRODUCTION_SHIFT_NOT_FOUND',
              'The production shift was not found.',
              404,
            ),
          );
        if (current.state === 'run_exists')
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_ALREADY_STARTED',
              'The order selection is frozen because production has started.',
              409,
            ),
          );
        if (current.version !== command.expectedVersion)
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_SELECTION_VERSION_CONFLICT',
              'The shift selection changed. Refresh it before choosing orders again.',
              409,
            ),
          );
        if (
          !(await repo.selectedOrdersAreReady(
            command.locationId,
            selectedOrderIds,
          ))
        )
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_SELECTION_NOT_READY',
              'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
              409,
            ),
          );

        const currentOrderIds = sorted(current.selectedOrderIds);
        let replaced: ReplaceProductionShiftSelectionResult;
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
                productionError(
                  'SCHEDULE_CURRENT_PLAN_STATE_INVALID',
                  'The current schedule revision cannot be superseded.',
                  409,
                ),
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
              productionError(
                'PRODUCTION_SHIFT_SELECTION_VERSION_CONFLICT',
                'The shift selection changed. Refresh it before choosing orders again.',
                409,
              ),
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
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_SELECTION_FAILED',
          'The shift order selection could not be saved.',
          500,
          error,
        ),
      );
    }
  };

import { result } from '@pressly/kernel';
import type {
  ProductionShift,
  UpdateProductionShiftResult,
} from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type {
  ClockPort,
  IdPort,
} from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionSignalsPort } from '../production-signals/production-signals.port.ts';
import type {
  CreateProductionShift,
  ManageProductionShiftRepository,
  UpdateProductionShift,
} from './manage-production-shift.port.ts';
export type {
  CreateProductionShift,
  UpdateProductionShift,
} from './manage-production-shift.port.ts';

export const makeCreateProductionShift =
  (deps: {
    repo: ManageProductionShiftRepository;
    clock: ClockPort;
    ids: IdPort;
    policy: ProductionPolicyPort;
  }): CreateProductionShift =>
  async (command) => {
    if (Date.parse(command.endsAt) <= Date.parse(command.startsAt))
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_WINDOW_INVALID',
          'Shift end must be after shift start.',
          422,
        ),
      );

    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_shift_created',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_shift',
          payload: {
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            timezone: command.timezone,
            effectiveFolderCount: command.effectiveFolderCount,
          },
        });
        const replay = resolveWorkEventReplay<ProductionShift>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const shift = {
          id: deps.ids.next(),
          locationId: command.locationId,
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          timezone: command.timezone,
          effectiveFolderCount: command.effectiveFolderCount,
          status: deps.policy.initialProductionShiftState,
          version: 1,
        };

        await repo.saveShift(shift);
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_created',
          entityType: 'production_shift',
          entityId: shift.id,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: { startsAt: shift.startsAt, endsAt: shift.endsAt },
          idempotency: { command: idempotency, result: shift },
        });

        return result.ok(shift);
      });
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_CREATE_FAILED',
          'The production shift could not be created.',
          409,
          error,
        ),
      );
    }
  };

const changedShiftFields = (
  current: ProductionShift,
  desired: Readonly<{
    startsAt: string;
    endsAt: string;
    effectiveFolderCount: number;
  }>,
): string[] => [
  ...(Date.parse(current.startsAt) === Date.parse(desired.startsAt)
    ? []
    : ['startsAt']),
  ...(Date.parse(current.endsAt) === Date.parse(desired.endsAt)
    ? []
    : ['endsAt']),
  ...(current.effectiveFolderCount === desired.effectiveFolderCount
    ? []
    : ['effectiveFolderCount']),
];

export const makeUpdateProductionShift = (deps: {
  repo: ManageProductionShiftRepository;
  clock: ClockPort;
  policy: ProductionPolicyPort;
  signals?: ProductionSignalsPort;
}): UpdateProductionShift =>
  async function updateProductionShift(command) {
    if (Date.parse(command.endsAt) <= Date.parse(command.startsAt))
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_WINDOW_INVALID',
          'Shift end must be after shift start.',
          422,
        ),
      );

    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_shift_updated',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          expectedVersion: command.expectedVersion,
          payload: {
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            effectiveFolderCount: command.effectiveFolderCount,
          },
        });
        const replay = resolveWorkEventReplay<UpdateProductionShiftResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock =
          resolveWorkEventReplay<UpdateProductionShiftResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);

        const current = await repo.lockShift(
          command.locationId,
          command.productionShiftId,
        );
        if (current === null)
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_NOT_FOUND',
              'The production shift was not found.',
              404,
            ),
          );
        if (current.version !== command.expectedVersion)
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_VERSION_CONFLICT',
              'The production shift changed before it could be updated.',
            ),
          );
        if (current.status === 'closed')
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_CLOSED',
              'A closed production shift cannot be updated.',
            ),
          );
        if (
          await repo.productionRunExists(
            command.locationId,
            command.productionShiftId,
          )
        )
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_ALREADY_STARTED',
              'A production run already exists for this shift.',
            ),
          );

        const changedFields = changedShiftFields(current, command);
        const now = deps.clock.now();
        let productionShift = current;
        let supersededScheduleRunId: string | null = null;

        if (changedFields.length > 0) {
          const updated = await repo.updateShift({
            locationId: command.locationId,
            productionShiftId: command.productionShiftId,
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            effectiveFolderCount: command.effectiveFolderCount,
            expectedVersion: command.expectedVersion,
            now,
          });
          if (updated === null)
            throw new Error('Locked production shift changed unexpectedly.');
          productionShift = updated;
          const currentSchedule = await repo.lockCurrentSchedule(
            command.locationId,
            command.productionShiftId,
          );
          if (currentSchedule !== null) {
            const lifecycle = deps.policy.evaluateScheduleRevisionTransition({
              state: currentSchedule.status,
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
            supersededScheduleRunId = await repo.supersedeCurrentSchedule({
              locationId: command.locationId,
              scheduleRunId: currentSchedule.scheduleRunId,
              lifecycle: lifecycle.value,
              now,
            });
          }
        }

        const updateResult: UpdateProductionShiftResult = {
          productionShift,
          supersededScheduleRunId,
          replayed: false,
        };
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_updated',
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            changedFields,
            previous: {
              startsAt: current.startsAt,
              endsAt: current.endsAt,
              effectiveFolderCount: current.effectiveFolderCount,
              version: current.version,
            },
            current: {
              startsAt: productionShift.startsAt,
              endsAt: productionShift.endsAt,
              effectiveFolderCount: productionShift.effectiveFolderCount,
              version: productionShift.version,
            },
            supersededScheduleRunId,
          },
          idempotency: { command: idempotency, result: updateResult },
        });

        return result.ok(updateResult);
      });
      if (
        outcome.tag === 'ok' &&
        !outcome.value.replayed &&
        outcome.value.supersededScheduleRunId !== null
      )
        deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_UPDATE_FAILED',
          'The production shift could not be updated.',
          500,
          error,
        ),
      );
    }
  };

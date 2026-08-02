import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '@pressly/contracts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  SetProductionOrderPriority,
  SetProductionOrderPriorityRepository,
} from './set-production-order-priority.port.ts';
export type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';

export const makeSetProductionOrderPriority =
  (deps: {
    repo: SetProductionOrderPriorityRepository;
    clock: ClockPort;
    policy: Pick<
      ProductionPolicyPort,
      'evaluateProductionOrderOperationalAccess'
    >;
  }): SetProductionOrderPriority =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_order_priority_changed',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_order',
          entityId: command.productionOrderId,
          expectedVersion: command.expectedVersion,
          payload: { priority: command.priority },
        });
        const replay = resolveWorkEventReplay<ProductionMutationResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const order = await repo.lockPriorityOrder(
          command.locationId,
          command.productionOrderId,
        );
        if (order === null)
          return result.err(
            notFoundError({
              code: 'production_order_not_found',
              message: 'The production order was not found.',
              safeMessage: 'The production order was not found.',
            }),
          );
        if (order.version !== command.expectedVersion)
          return result.err(
            conflictError({
              code: 'production_order_version_conflict',
              message: 'The order changed before priority could be updated.',
              safeMessage:
                'The order changed before priority could be updated.',
            }),
          );
        const access = deps.policy.evaluateProductionOrderOperationalAccess({
          resolutionState: order.resolutionState,
        });
        if (access.tag === 'err')
          return result.err(
            conflictError({
              code: access.error.code.toLowerCase(),
              message: access.error.message,
              safeMessage: access.error.message,
            }),
          );
        const updated = await repo.setOrderPriority({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          priority: command.priority,
          expectedVersion: command.expectedVersion,
          now: deps.clock.now(),
        });

        if (updated === null)
          return result.err(
            conflictError({
              code: 'production_order_version_conflict',
              message: 'The order changed before priority could be updated.',
              safeMessage:
                'The order changed before priority could be updated.',
            }),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_priority_changed',
          entityType: 'production_order',
          entityId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: { priority: command.priority, version: updated.version },
          idempotency: { command: idempotency, result: updated },
        });

        return result.ok(updated);
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'production_priority_failed',
            message: 'Order priority could not be updated.',
            safeMessage: 'Order priority could not be updated.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };

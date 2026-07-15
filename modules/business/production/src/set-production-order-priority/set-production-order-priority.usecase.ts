import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort } from '../production.port.ts';
import type {
  SetProductionOrderPriority,
  SetProductionOrderPriorityRepository,
} from './set-production-order-priority.port.ts';
export type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';

export const makeSetProductionOrderPriority =
  (deps: {
    repo: SetProductionOrderPriorityRepository;
    clock: ClockPort;
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
        const updated = await repo.setOrderPriority({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          priority: command.priority,
          expectedVersion: command.expectedVersion,
          now: deps.clock.now(),
        });

        if (updated === null)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_VERSION_CONFLICT',
              'The order changed before priority could be updated.',
            ),
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
        productionError(
          'PRODUCTION_PRIORITY_FAILED',
          'Order priority could not be updated.',
          500,
          error,
        ),
      );
    }
  };

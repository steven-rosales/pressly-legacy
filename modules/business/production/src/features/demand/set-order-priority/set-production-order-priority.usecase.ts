import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import type {
  SetProductionOrderPriority,
  SetProductionOrderPriorityRepository,
} from './set-production-order-priority.port.ts';

export const makeSetProductionOrderPriority =
  (deps: {
    repo: SetProductionOrderPriorityRepository;
    clock: Clock;
    policy: Pick<ProductionRules, 'evaluateProductionOrderOperationalAccess'>;
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
            notFoundFailure({
              code: 'production_order_not_found',
              message: 'The production order was not found.',
              safeMessage: 'The production order was not found.',
            }),
          );
        if (order.version !== command.expectedVersion)
          return result.err(
            conflictFailure({
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
            conflictFailure({
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
            conflictFailure({
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
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_priority_failed',
          message: 'Order priority could not be updated.',
          safeMessage: 'Order priority could not be updated.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

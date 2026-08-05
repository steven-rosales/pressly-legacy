import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { OrderMutationResult } from '../../../foundations/language/command-execution/order-command.model.ts';
import { isOrderCommandReasonValid } from '../../../foundations/language/command-execution/order-command-reason.policy.ts';
import { orderLifecycleFailure } from '../../../foundations/language/order-lifecycle/order-lifecycle.failure.ts';
import { decideOrderLifecycle } from '../../../foundations/language/order-lifecycle/order-lifecycle.lifecycle.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type { OrderLifecycleTransaction } from '../../../foundations/ports/order-lifecycle-transaction/order-lifecycle-transaction.port.ts';
import type {
  CompleteOrder,
  CompleteOrderCommand,
} from './complete-order.port.ts';
import { completeOrderReasonCodes } from './complete-order.policy.ts';

const isCompleteOrderCommandValid = (command: CompleteOrderCommand): boolean =>
  command.businessId.trim() !== '' &&
  command.idempotencyKey.trim() !== '' &&
  isCommandContextValid(command.context) &&
  command.locationId.trim() !== '' &&
  command.orderId.trim() !== '' &&
  command.expectedVersion >= 1 &&
  isOrderCommandReasonValid({
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote,
    allowedReasonCodes: completeOrderReasonCodes,
  });

export const makeCompleteOrder = (deps: {
  repo: OrderLifecycleTransaction;
  clock: Clock;
}): CompleteOrder =>
  async function completeOrder(command) {
    if (!isCompleteOrderCommandValid(command))
      return result.err(orderLifecycleFailure.invalid());

    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const receipt = await operations.loadCommandReceipt(
          command.idempotencyKey,
        );
        if (receipt !== null)
          return receipt.commandHash === commandHash
            ? {
                kind: 'ok' as const,
                value: { ...receipt.result, replayed: true },
              }
            : { kind: 'idempotency_conflict' as const };

        await operations.lockOrder(command.businessId, command.orderId);
        const current = await operations.loadOrder(
          command.businessId,
          command.orderId,
        );
        if (
          current === null ||
          current.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        if (current.order.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };

        const decision = decideOrderLifecycle(current.order.state, {
          type: 'complete',
        });
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== 'completed')
          throw orderInvariantError(
            'ORDER_LIFECYCLE_GRAPH_STATE_INVALID',
            'Order lifecycle graph returned an unexpected state.',
          );

        const nextOrderVersion = current.order.version + 1;
        await operations.applyOrderLifecycle({
          current,
          target: 'completed',
          nextOrderVersion,
          now,
        });
        const value: OrderMutationResult = {
          orderId: current.order.id,
          fulfillmentId: current.fulfillment.id,
          version: nextOrderVersion,
          replayed: false,
        };
        await operations.saveCommandReceipt({
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          value,
          now,
        });
        return { kind: 'ok' as const, value };
      });

      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(orderLifecycleFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(orderLifecycleFailure.versionConflict());
      if (outcome.kind === 'invalid_transition')
        return result.err(orderLifecycleFailure.invalidTransition());
      return result.err(orderLifecycleFailure.idempotencyConflict());
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_lifecycle_command_failed',
          message: 'The order lifecycle command could not be completed.',
          safeMessage: 'The order lifecycle command could not be completed.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

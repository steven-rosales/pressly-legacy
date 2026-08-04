import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { OrderMutationResult } from '../../../foundations/language/command-execution/order-command.model.ts';
import { isOrderCommandReasonValid } from '../../../foundations/language/command-execution/order-command-reason.policy.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type { OrderState } from '../../../foundations/language/order/order.model.ts';
import {
  cancelOrderReasonCodes,
  completeOrderReasonCodes,
  decideOrderLifecycle,
  type OrderLifecycleEvent,
} from './change-order-lifecycle.policy.ts';
import type {
  CancelOrder,
  CancelOrderCommand,
  CompleteOrder,
  CompleteOrderCommand,
} from './change-order-lifecycle.port.ts';
import type { ChangeOrderLifecycleRepository } from './change-order-lifecycle.port.ts';
import { changeOrderLifecycleFailure } from './change-order-lifecycle.failure.ts';

type LifecycleCommand = CompleteOrderCommand | CancelOrderCommand;

const makeOrderLifecycleCommand =
  <Command extends LifecycleCommand>(input: {
    repo: ChangeOrderLifecycleRepository;
    clock: Clock;
    event: OrderLifecycleEvent;
    target: Exclude<OrderState, 'open'>;
    allowedReasonCodes: readonly Command['reasonCode'][];
  }) =>
  async (command: Command) => {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.locationId.trim() === '' ||
      command.orderId.trim() === '' ||
      command.expectedVersion < 1 ||
      !isOrderCommandReasonValid({
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote,
        allowedReasonCodes: input.allowedReasonCodes,
      })
    )
      return result.err(changeOrderLifecycleFailure.invalid());
    try {
      const commandHash = hashOrderCommand(command);
      const now = input.clock.now();
      const outcome = await input.repo.transaction(async (operations) => {
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

        const decision = decideOrderLifecycle(current.order.state, input.event);
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== input.target)
          throw orderInvariantError(
            'ORDER_LIFECYCLE_GRAPH_STATE_INVALID',
            'Order lifecycle graph returned an unexpected state.',
          );

        const nextOrderVersion = current.order.version + 1;
        await operations.applyOrderLifecycle({
          current,
          target: input.target,
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
        return result.err(changeOrderLifecycleFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(changeOrderLifecycleFailure.versionConflict());
      if (outcome.kind === 'invalid_transition')
        return result.err(changeOrderLifecycleFailure.invalidTransition());
      return result.err(changeOrderLifecycleFailure.idempotencyConflict());
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

export const makeCompleteOrder = (deps: {
  repo: ChangeOrderLifecycleRepository;
  clock: Clock;
}): CompleteOrder =>
  makeOrderLifecycleCommand<CompleteOrderCommand>({
    ...deps,
    event: { type: 'complete' },
    target: 'completed',
    allowedReasonCodes: completeOrderReasonCodes,
  });

export const makeCancelOrder = (deps: {
  repo: ChangeOrderLifecycleRepository;
  clock: Clock;
}): CancelOrder =>
  makeOrderLifecycleCommand<CancelOrderCommand>({
    ...deps,
    event: { type: 'cancel' },
    target: 'canceled',
    allowedReasonCodes: cancelOrderReasonCodes,
  });

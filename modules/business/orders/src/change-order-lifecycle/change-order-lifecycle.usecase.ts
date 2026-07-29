import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import {
  cancelOrderReasonCodes,
  completeOrderReasonCodes,
  isOrderCommandReasonValid,
} from '../order-command-reason.policy.ts';
import { orderError } from '../order.error.ts';
import {
  decideOrderLifecycle,
  type OrderLifecycleEvent,
} from '../order-lifecycle.policy.ts';
import type {
  CancelOrder,
  CancelOrderCommand,
  CompleteOrder,
  CompleteOrderCommand,
  OrderClockPort,
  OrderMutationResult,
  OrderState,
} from '../orders.port.ts';
import type { ChangeOrderLifecycleRepository } from './change-order-lifecycle.port.ts';

type LifecycleCommand = CompleteOrderCommand | CancelOrderCommand;

const makeOrderLifecycleCommand =
  <Command extends LifecycleCommand>(input: {
    repo: ChangeOrderLifecycleRepository;
    clock: OrderClockPort;
    event: OrderLifecycleEvent;
    target: Exclude<OrderState, 'open'>;
    allowedReasonCodes: readonly Command['reasonCode'][];
  }) =>
  async (command: Command) => {
    if (
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
      return result.err(
        orderError(
          'ORDER_LIFECYCLE_COMMAND_INVALID',
          'The order lifecycle command is incomplete.',
          400,
        ),
      );
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

        await operations.lockOrder(command.orderId);
        const current = await operations.loadOrder(command.orderId);
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
          throw new Error(
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
        return result.err(
          orderError('ORDER_NOT_FOUND', 'The order was not found.', 404),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'ORDER_VERSION_CONFLICT',
            'The order changed after this lifecycle command was prepared. Refresh and try again.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'ORDER_TRANSITION_INVALID',
            'The requested lifecycle command is not allowed from the current order state.',
          ),
        );
      return result.err(
        orderError(
          'ORDER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different order command.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_LIFECYCLE_COMMAND_FAILED',
          'The order lifecycle command could not be completed.',
          503,
          error,
        ),
      );
    }
  };

export const makeCompleteOrder = (deps: {
  repo: ChangeOrderLifecycleRepository;
  clock: OrderClockPort;
}): CompleteOrder =>
  makeOrderLifecycleCommand<CompleteOrderCommand>({
    ...deps,
    event: { type: 'complete' },
    target: 'completed',
    allowedReasonCodes: completeOrderReasonCodes,
  });

export const makeCancelOrder = (deps: {
  repo: ChangeOrderLifecycleRepository;
  clock: OrderClockPort;
}): CancelOrder =>
  makeOrderLifecycleCommand<CancelOrderCommand>({
    ...deps,
    event: { type: 'cancel' },
    target: 'canceled',
    allowedReasonCodes: cancelOrderReasonCodes,
  });

import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import { orderError } from '../order.error.ts';
import { orderSourceFields } from '../order-field-authority.policy.ts';
import { mayTransitionOrder } from '../order-lifecycle.policy.ts';
import type { OrderClockPort, UpdateOrder } from '../orders.port.ts';
import type { UpdateOrderRepository } from './update-order.port.ts';

export const makeUpdateOrder =
  (deps: { repo: UpdateOrderRepository; clock: OrderClockPort }): UpdateOrder =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.locationId.trim() === '' ||
      command.orderId.trim() === '' ||
      command.expectedVersion < 1 ||
      Object.keys(command.changes).length === 0
    )
      return result.err(
        orderError(
          'ORDER_UPDATE_INVALID',
          'The order update is incomplete.',
          400,
        ),
      );
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

        await operations.lockOrder(command.orderId);
        const current = await operations.loadOrder(command.orderId);
        if (
          current === null ||
          current.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        if (current.order.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        const targetState = command.changes.state ?? current.order.state;
        if (!mayTransitionOrder(current.order.state, targetState))
          return { kind: 'invalid_transition' as const };

        const nextOrderVersion = current.order.version + 1;
        const authorityFields = orderSourceFields.filter((field) =>
          field === 'customer'
            ? command.changes.customer !== undefined
            : field in command.changes,
        );
        await operations.applyOrderUpdate({
          current,
          changes: command.changes,
          targetState,
          authorityFields,
          nextOrderVersion,
          now,
        });
        const value = {
          orderId: current.order.id,
          fulfillmentId: current.fulfillment.id,
          version: nextOrderVersion,
          replayed: false,
        };
        await operations.saveCommandReceipt({
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
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
            'The order changed after this update was prepared. Refresh and try again.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'ORDER_TRANSITION_INVALID',
            'A completed or canceled order cannot return to an earlier state.',
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
          'ORDER_UPDATE_FAILED',
          'The order could not be updated.',
          503,
          error,
        ),
      );
    }
  };

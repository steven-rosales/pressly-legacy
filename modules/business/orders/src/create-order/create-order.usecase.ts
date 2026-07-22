import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import { orderError } from '../order.error.ts';
import {
  fulfillmentReleaseAuthorityField,
  orderSourceFields,
} from '../order-field-authority.policy.ts';
import { isOrderInputValid } from '../order-input.policy.ts';
import type { CreateOrder, OrderClockPort } from '../orders.port.ts';
import type { CreateOrderRepository } from './create-order.port.ts';

export const makeCreateOrder =
  (deps: { repo: CreateOrderRepository; clock: OrderClockPort }): CreateOrder =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      !isOrderInputValid(command)
    )
      return result.err(
        orderError('ORDER_CREATE_INVALID', 'The order is incomplete.', 400),
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

        const value = await operations.createOrder({
          order: command,
          authorityFields: [
            ...orderSourceFields,
            fulfillmentReleaseAuthorityField(command.fulfillment.typeCode),
          ],
          now,
        });
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
      return result.err(
        orderError(
          'ORDER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different order command.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_CREATE_FAILED',
          'The order could not be created.',
          503,
          error,
        ),
      );
    }
  };

import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import {
  createOrderReasonCodes,
  isOrderCommandReasonValid,
} from '../order-command-reason.policy.ts';
import { orderError } from '../order.error.ts';
import { isOrderInputValid } from '../order-input.policy.ts';
import type {
  CreateOrder,
  OrderClockPort,
  OrderInput,
} from '../orders.port.ts';
import type { CreateOrderRepository } from './create-order.port.ts';

export const makeCreateOrder =
  (deps: { repo: CreateOrderRepository; clock: OrderClockPort }): CreateOrder =>
  async (command) => {
    const canonicalOrder: OrderInput = {
      customer: command.customer,
      displayNumber: command.displayNumber,
      state: 'open',
      dueAt: command.dueAt,
      currency: command.currency,
      totalAmountCents: command.totalAmountCents,
      balanceDueCents: command.balanceDueCents,
      items: command.items,
      fulfillment: {
        ...command.fulfillment,
        releaseState: 'unreleased',
        bagCount: null,
      },
    };
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      !isOrderCommandReasonValid({
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote,
        allowedReasonCodes: createOrderReasonCodes,
      }) ||
      !isOrderInputValid(canonicalOrder)
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
          order: canonicalOrder,
          now,
        });
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

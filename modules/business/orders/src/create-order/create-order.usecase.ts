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
      command.businessId.trim() === '' ||
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

        const referencesValid = await operations.validateReferences({
          businessId: command.businessId,
          locationId: canonicalOrder.fulfillment.locationId,
          customerUserId:
            canonicalOrder.customer.resolution === 'resolved'
              ? canonicalOrder.customer.userId
              : null,
        });
        if (!referencesValid) return { kind: 'reference_not_found' as const };

        const value = await operations.createOrder({
          businessId: command.businessId,
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
      if (outcome.kind === 'reference_not_found')
        return result.err(
          orderError(
            'ORDER_REFERENCE_NOT_FOUND',
            'The selected customer or fulfillment location was not found.',
            404,
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
          'ORDER_CREATE_FAILED',
          'The order could not be created.',
          503,
          error,
        ),
      );
    }
  };

import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { isOrderCommandReasonValid } from '../../../foundations/language/command-execution/order-command-reason.policy.ts';

import { isOrderInputValid } from '../../../foundations/language/order/order-input.policy.ts';
import type { OrderInput } from '../../../foundations/language/order/order.model.ts';
import type { CreateOrder } from './create-order.port.ts';
import type { CreateOrderRepository } from './create-order.port.ts';
import { createOrderFailure } from './create-order.failure.ts';
import { createOrderReasonCodes } from './create-order.policy.ts';

export const makeCreateOrder =
  (deps: { repo: CreateOrderRepository; clock: Clock }): CreateOrder =>
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
      return result.err(createOrderFailure.invalid());
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
        return result.err(createOrderFailure.referenceNotFound());
      return result.err(createOrderFailure.idempotencyConflict());
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_create_failed',
          message: 'The order could not be created.',
          safeMessage: 'The order could not be created.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

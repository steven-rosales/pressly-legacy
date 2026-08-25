import type { OrderLocationFactsV1Capability } from '@pressly/access-system/capabilities/order-location-facts-v1';
import type { CellOutcome } from '@pressly/cells';
import type { CustomerReferenceV1Capability } from '@pressly/customers-system/capabilities/customer-reference-v1';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { orderCustomerSnapshotFromReference } from '../../../model/canonical-order/customer-snapshot.ts';
import {
  hashOrderCommand,
  isAuditedOrderCommandValid,
  isCanonicalOrderInputValid,
} from '../../../model/canonical-order/policy.ts';
import {
  createStoredOrder,
  loadOrderCommandReceipt,
  lockOrderKey,
  saveOrderCommandReceipt,
} from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type {
  CreateOrderCommand,
  CreateOrderExpectedFailure,
} from './types.ts';

const failure = Object.freeze({
  invalid: (): CreateOrderExpectedFailure => ({
    kind: 'validation',
    code: 'order_create_invalid',
    message: 'The order is incomplete.',
  }),
  referenceNotFound: (): CreateOrderExpectedFailure => ({
    kind: 'not_found',
    code: 'order_reference_not_found',
    message: 'The selected customer or fulfillment location was not found.',
  }),
  idempotencyConflict: (): CreateOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const makeCreateOrderPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
    customerReferenceV1: CustomerReferenceV1Capability;
    orderLocationFactsV1: OrderLocationFactsV1Capability;
  }) =>
  async (
    command: CreateOrderCommand,
  ): Promise<CellOutcome<OrderMutationResult, CreateOrderExpectedFailure>> => {
    const canonicalOrder = {
      customer: command.customer,
      displayNumber: command.displayNumber,
      state: 'open' as const,
      dueAt: command.dueAt,
      currency: command.currency,
      totalAmountCents: command.totalAmountCents,
      balanceDueCents: command.balanceDueCents,
      items: command.items,
      fulfillment: {
        ...command.fulfillment,
        releaseState: 'unreleased' as const,
      },
    };
    if (
      !isAuditedOrderCommandValid(command, [
        'new_customer_order',
        'recovery_entry',
      ]) ||
      !isCanonicalOrderInputValid(canonicalOrder)
    )
      return { kind: 'failure', failure: failure.invalid() };

    try {
      const commandHash = hashOrderCommand(command);
      const now = dependencies.clock.now();
      const priorReceipt = await loadOrderCommandReceipt(
        dependencies.db,
        dependencies.schema,
        command.idempotencyKey,
      );
      if (priorReceipt !== null)
        return priorReceipt.commandHash === commandHash
          ? {
              kind: 'success',
              value: { ...priorReceipt.result, replayed: true },
            }
          : { kind: 'failure', failure: failure.idempotencyConflict() };

      const customerReference =
        canonicalOrder.customer.resolution === 'resolved'
          ? await dependencies.customerReferenceV1.execute({
              businessId: command.businessId,
              customerId: canonicalOrder.customer.userId,
            })
          : null;
      if (
        canonicalOrder.customer.resolution === 'resolved' &&
        (customerReference === null ||
          customerReference.customerId !== canonicalOrder.customer.userId ||
          customerReference.businessId !== command.businessId)
      )
        return { kind: 'failure', failure: failure.referenceNotFound() };
      const customerSnapshot =
        customerReference === null
          ? null
          : orderCustomerSnapshotFromReference(customerReference);

      const outcome = await dependencies.db.transaction(async (transaction) => {
        await lockOrderKey(
          transaction,
          `orders:command:${command.idempotencyKey}`,
        );
        const receipt = await loadOrderCommandReceipt(
          transaction,
          dependencies.schema,
          command.idempotencyKey,
        );
        if (receipt !== null)
          return receipt.commandHash === commandHash
            ? {
                kind: 'ok' as const,
                value: { ...receipt.result, replayed: true },
              }
            : { kind: 'idempotency_conflict' as const };

        const location = await dependencies.orderLocationFactsV1.execute({
          locationId: canonicalOrder.fulfillment.locationId,
        });
        if (
          location === null ||
          location.businessId !== command.businessId ||
          !location.isActive
        )
          return { kind: 'reference_not_found' as const };
        const value = await createStoredOrder(
          transaction,
          dependencies.schema,
          {
            businessId: command.businessId,
            order: canonicalOrder,
            customerSnapshot,
            now,
          },
        );
        await saveOrderCommandReceipt(transaction, dependencies.schema, {
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

      if (outcome.kind === 'ok')
        return { kind: 'success', value: outcome.value };
      if (outcome.kind === 'reference_not_found')
        return { kind: 'failure', failure: failure.referenceNotFound() };
      return { kind: 'failure', failure: failure.idempotencyConflict() };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_create_failed',
          message: 'The order could not be created.',
          safeMessage: 'The order could not be created.',
          status: 503,
          cause,
        }),
      );
    }
  };

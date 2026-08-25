import type { CellOutcome } from '@pressly/cells';
import type { CustomerReferenceV1Capability } from '@pressly/customers-system/capabilities/customer-reference-v1';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { orderCustomerSnapshotFromReference } from '../../../model/canonical-order/customer-snapshot.ts';
import {
  decideOrderCorrection,
  hashOrderCommand,
  isAuditedOrderCommandValid,
} from '../../../model/canonical-order/policy.ts';
import {
  applyOrderCorrection,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredFulfillment,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type {
  CorrectOrderCommand,
  CorrectOrderExpectedFailure,
} from './types.ts';

const failure = Object.freeze({
  invalid: (): CorrectOrderExpectedFailure => ({
    kind: 'validation',
    code: 'order_correction_invalid',
    message: 'The order correction is incomplete.',
  }),
  notFound: (): CorrectOrderExpectedFailure => ({
    kind: 'not_found',
    code: 'order_not_found',
    message: 'The order was not found.',
  }),
  customerNotFound: (): CorrectOrderExpectedFailure => ({
    kind: 'not_found',
    code: 'order_customer_not_found',
    message: 'The selected customer was not found.',
  }),
  versionConflict: (): CorrectOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_version_conflict',
    message:
      'The Order or fulfillment changed after this correction was prepared. Refresh and try again.',
  }),
  locationMove: (): CorrectOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_location_move_requires_command',
    message:
      'Moving an Order to another location requires a dedicated cross-location command.',
  }),
  fulfillmentCommitment: (): CorrectOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'fulfillment_commitment_conflict',
    message: 'A released fulfillment cannot change its type or location.',
  }),
  idempotencyConflict: (): CorrectOrderExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different order command.',
  }),
});

export const makeCorrectOrderPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
    customerReferenceV1: CustomerReferenceV1Capability;
  }) =>
  async (
    command: CorrectOrderCommand,
  ): Promise<CellOutcome<OrderMutationResult, CorrectOrderExpectedFailure>> => {
    if (
      !isAuditedOrderCommandValid(command, [
        'customer_correction',
        'manager_correction',
        'source_discrepancy',
      ]) ||
      command.locationId.trim() === '' ||
      command.orderId.trim() === '' ||
      command.expectedOrderVersion < 1 ||
      command.expectedFulfillmentVersion < 1
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

      const changedCustomer = command.changes.customer;
      const customerReference =
        changedCustomer?.resolution === 'resolved'
          ? await dependencies.customerReferenceV1.execute({
              businessId: command.businessId,
              customerId: changedCustomer.userId,
            })
          : null;
      if (
        changedCustomer?.resolution === 'resolved' &&
        (customerReference === null ||
          customerReference.customerId !== changedCustomer.userId ||
          customerReference.businessId !== command.businessId)
      )
        return { kind: 'failure', failure: failure.customerNotFound() };
      const customerSnapshot =
        changedCustomer === undefined
          ? undefined
          : customerReference === null
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

        await lockStoredOrder(transaction, command.businessId, command.orderId);
        const candidate = await loadOrderAggregate(
          transaction,
          dependencies.schema,
          command.businessId,
          command.orderId,
        );
        if (
          candidate === null ||
          candidate.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        await lockStoredFulfillment(
          transaction,
          command.businessId,
          candidate.fulfillment.id,
        );
        const current = await loadOrderAggregate(
          transaction,
          dependencies.schema,
          command.businessId,
          command.orderId,
        );
        if (
          current === null ||
          current.fulfillment.id !== candidate.fulfillment.id ||
          current.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        if (
          current.order.version !== command.expectedOrderVersion ||
          current.fulfillment.version !== command.expectedFulfillmentVersion
        )
          return { kind: 'version_conflict' as const };
        const decision = decideOrderCorrection({
          current,
          locationScope: command.locationId,
          changes: command.changes,
        });
        if (decision.kind === 'denied')
          return {
            kind: 'correction_denied' as const,
            reason: decision.reason,
          };
        const nextOrderVersion = current.order.version + 1;
        const nextFulfillmentVersion =
          current.fulfillment.version + (decision.fulfillmentChanged ? 1 : 0);
        await applyOrderCorrection(transaction, dependencies.schema, {
          current,
          changes: command.changes,
          customerSnapshot,
          nextFulfillment: {
            ...current.fulfillment,
            ...decision.nextFulfillment,
            version: nextFulfillmentVersion,
          },
          nextOrderVersion,
          nextFulfillmentVersion,
          now,
        });
        const value: OrderMutationResult = {
          orderId: current.order.id,
          fulfillmentId: current.fulfillment.id,
          version: nextOrderVersion,
          replayed: false,
        };
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
      if (outcome.kind === 'not_found')
        return { kind: 'failure', failure: failure.notFound() };
      if (outcome.kind === 'version_conflict')
        return { kind: 'failure', failure: failure.versionConflict() };
      if (outcome.kind === 'correction_denied')
        return {
          kind: 'failure',
          failure:
            outcome.reason === 'invalid'
              ? failure.invalid()
              : outcome.reason === 'location_move'
                ? failure.locationMove()
                : failure.fulfillmentCommitment(),
        };
      return { kind: 'failure', failure: failure.idempotencyConflict() };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_correction_failed',
          message: 'The order could not be corrected.',
          safeMessage: 'The order could not be corrected.',
          status: 503,
          cause,
        }),
      );
    }
  };

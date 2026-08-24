import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import {
  decideOrderLifecycle,
  hashOrderCommand,
} from '../../../model/canonical-order/policy.ts';
import {
  applyOrderLifecycle,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { completeOrderFailure, validateCompleteOrder } from './decide.ts';
import type {
  CompleteOrderCommand,
  CompleteOrderExpectedFailure,
} from './types.ts';

export const makeCompleteOrderPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
  }) =>
  async (
    command: CompleteOrderCommand,
  ): Promise<
    CellOutcome<OrderMutationResult, CompleteOrderExpectedFailure>
  > => {
    const expectedFailure = validateCompleteOrder(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const commandHash = hashOrderCommand(command);
      const now = dependencies.clock.now();
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
        const current = await loadOrderAggregate(
          transaction,
          dependencies.schema,
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

        const decision = decideOrderLifecycle(current.order.state, 'complete');
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== 'completed')
          throw invariantViolationError({
            code: 'order_lifecycle_graph_state_invalid',
            message: 'Order lifecycle graph returned an unexpected state.',
            safeMessage: 'Stored order data is inconsistent.',
          });

        const nextOrderVersion = current.order.version + 1;
        await applyOrderLifecycle(transaction, dependencies.schema, {
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
        return { kind: 'failure', failure: completeOrderFailure.notFound() };
      if (outcome.kind === 'version_conflict')
        return {
          kind: 'failure',
          failure: completeOrderFailure.versionConflict(),
        };
      if (outcome.kind === 'invalid_transition')
        return {
          kind: 'failure',
          failure: completeOrderFailure.invalidTransition(),
        };
      return {
        kind: 'failure',
        failure: completeOrderFailure.idempotencyConflict(),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_lifecycle_command_failed',
          message: 'The order lifecycle command could not be completed.',
          safeMessage: 'The order lifecycle command could not be completed.',
          status: 503,
          cause,
        }),
      );
    }
  };

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
  decideFulfillmentRelease,
  hashOrderCommand,
} from '../../../model/canonical-order/policy.ts';
import {
  applyFulfillmentRelease,
  findOrderIdForFulfillment,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredFulfillment,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type {
  WithdrawFulfillmentCommand,
  WithdrawFulfillmentExpectedFailure,
} from './types.ts';
import {
  validateWithdrawFulfillment,
  withdrawFulfillmentFailure,
} from './decide.ts';

export const makeWithdrawFulfillmentPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
  }) =>
  async (
    command: WithdrawFulfillmentCommand,
  ): Promise<
    CellOutcome<OrderMutationResult, WithdrawFulfillmentExpectedFailure>
  > => {
    const expectedFailure = validateWithdrawFulfillment(command);
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

        const orderId = await findOrderIdForFulfillment(
          transaction,
          dependencies.schema,
          command.businessId,
          command.fulfillmentId,
        );
        if (orderId === null) return { kind: 'not_found' as const };
        await lockStoredOrder(transaction, command.businessId, orderId);
        await lockStoredFulfillment(
          transaction,
          command.businessId,
          command.fulfillmentId,
        );
        const current = await loadOrderAggregate(
          transaction,
          dependencies.schema,
          command.businessId,
          orderId,
        );
        if (
          current === null ||
          current.fulfillment.id !== command.fulfillmentId ||
          current.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        if (
          current.order.version !== command.expectedOrderVersion ||
          current.fulfillment.version !== command.expectedFulfillmentVersion
        )
          return { kind: 'version_conflict' as const };

        const decision = decideFulfillmentRelease(
          current.fulfillment.releaseState,
          'withdraw',
        );
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== 'withdrawn')
          throw invariantViolationError({
            code: 'fulfillment_release_graph_state_invalid',
            message: 'Fulfillment release graph returned an unexpected state.',
            safeMessage: 'Stored order data is inconsistent.',
          });

        const nextOrderVersion = current.order.version + 1;
        await applyFulfillmentRelease(transaction, dependencies.schema, {
          current,
          target: 'withdrawn',
          nextOrderVersion,
          nextFulfillmentVersion: current.fulfillment.version + 1,
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
        return {
          kind: 'failure',
          failure: withdrawFulfillmentFailure.notFound(),
        };
      if (outcome.kind === 'version_conflict')
        return {
          kind: 'failure',
          failure: withdrawFulfillmentFailure.versionConflict(),
        };
      if (outcome.kind === 'invalid_transition')
        return {
          kind: 'failure',
          failure: withdrawFulfillmentFailure.invalidTransition(),
        };
      return {
        kind: 'failure',
        failure: withdrawFulfillmentFailure.idempotencyConflict(),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'fulfillment_release_command_failed',
          message: 'The fulfillment release command could not be completed.',
          safeMessage:
            'The fulfillment release command could not be completed.',
          status: 503,
          cause,
        }),
      );
    }
  };

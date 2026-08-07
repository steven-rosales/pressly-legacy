import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { OrderMutationResult } from '../../../foundations/language/command-execution/order-command.model.ts';
import { isOrderCommandReasonValid } from '../../../foundations/language/command-execution/order-command-reason.policy.ts';
import { fulfillmentReleaseFailure } from '../../../foundations/language/fulfillment-release/fulfillment-release.failure.ts';
import { decideFulfillmentRelease } from '../../../foundations/language/fulfillment-release/fulfillment-release.lifecycle.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type { FulfillmentReleaseTransaction } from '../../../foundations/ports/fulfillment-release-transaction/fulfillment-release-transaction.port.ts';
import type {
  WithdrawFulfillment,
  WithdrawFulfillmentCommand,
} from './withdraw-fulfillment.port.ts';
import { withdrawFulfillmentReasonCodes } from './withdraw-fulfillment.policy.ts';

const isWithdrawFulfillmentCommandValid = (
  command: WithdrawFulfillmentCommand,
): boolean =>
  command.businessId.trim() !== '' &&
  command.idempotencyKey.trim() !== '' &&
  isCommandContextValid(command.context) &&
  command.fulfillmentId.trim() !== '' &&
  command.locationId.trim() !== '' &&
  command.expectedOrderVersion >= 1 &&
  command.expectedFulfillmentVersion >= 1 &&
  isOrderCommandReasonValid({
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote,
    allowedReasonCodes: withdrawFulfillmentReasonCodes,
  });

export const makeWithdrawFulfillment = (deps: {
  repo: FulfillmentReleaseTransaction;
  clock: Clock;
}): WithdrawFulfillment =>
  async function withdrawFulfillment(command) {
    if (!isWithdrawFulfillmentCommandValid(command))
      return result.err(fulfillmentReleaseFailure.invalid());

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

        const orderId = await operations.findOrderId(
          command.businessId,
          command.fulfillmentId,
        );
        if (orderId === null) return { kind: 'not_found' as const };

        await operations.lockOrder(command.businessId, orderId);
        await operations.lockFulfillment(
          command.businessId,
          command.fulfillmentId,
        );
        const current = await operations.loadFulfillmentOrder(
          command.businessId,
          command.fulfillmentId,
        );
        if (
          current === null ||
          current.order.id !== orderId ||
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
          { type: 'withdraw' },
        );
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== 'withdrawn')
          throw orderInvariantError(
            'FULFILLMENT_RELEASE_GRAPH_STATE_INVALID',
            'Fulfillment release graph returned an unexpected state.',
          );

        const nextOrderVersion = current.order.version + 1;
        await operations.applyFulfillmentRelease({
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
        return result.err(fulfillmentReleaseFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(fulfillmentReleaseFailure.versionConflict());
      if (outcome.kind === 'invalid_transition')
        return result.err(fulfillmentReleaseFailure.invalidTransition());
      return result.err(fulfillmentReleaseFailure.idempotencyConflict());
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'fulfillment_release_command_failed',
          message: 'The fulfillment release command could not be completed.',
          safeMessage:
            'The fulfillment release command could not be completed.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

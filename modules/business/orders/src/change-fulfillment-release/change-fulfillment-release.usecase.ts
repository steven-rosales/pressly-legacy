import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import {
  isOrderCommandReasonValid,
  releaseFulfillmentReasonCodes,
  withdrawFulfillmentReasonCodes,
} from '../order-command-reason.policy.ts';
import { orderError } from '../order.error.ts';
import {
  decideFulfillmentRelease,
  type FulfillmentReleaseEvent,
} from '../order-lifecycle.policy.ts';
import type {
  FulfillmentReleaseState,
  OrderClockPort,
  OrderMutationResult,
  ReleaseFulfillment,
  ReleaseFulfillmentCommand,
  WithdrawFulfillment,
  WithdrawFulfillmentCommand,
} from '../orders.port.ts';
import type { ChangeFulfillmentReleaseRepository } from './change-fulfillment-release.port.ts';

type FulfillmentCommand =
  | ReleaseFulfillmentCommand
  | WithdrawFulfillmentCommand;

const makeFulfillmentReleaseCommand =
  <Command extends FulfillmentCommand>(input: {
    repo: ChangeFulfillmentReleaseRepository;
    clock: OrderClockPort;
    event: FulfillmentReleaseEvent;
    target: Exclude<FulfillmentReleaseState, 'unreleased'>;
    allowedReasonCodes: readonly Command['reasonCode'][];
  }) =>
  async (command: Command) => {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.fulfillmentId.trim() === '' ||
      command.locationId.trim() === '' ||
      command.expectedOrderVersion < 1 ||
      command.expectedFulfillmentVersion < 1 ||
      !isOrderCommandReasonValid({
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote,
        allowedReasonCodes: input.allowedReasonCodes,
      })
    )
      return result.err(
        orderError(
          'FULFILLMENT_RELEASE_COMMAND_INVALID',
          'The fulfillment release command is incomplete.',
          400,
        ),
      );
    try {
      const commandHash = hashOrderCommand(command);
      const now = input.clock.now();
      const outcome = await input.repo.transaction(async (operations) => {
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

        // All canonical fulfillment commands acquire aggregate locks in the
        // same order: Order first, then Fulfillment.
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
          input.event,
        );
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (decision.to !== input.target)
          throw new Error(
            'Fulfillment release graph returned an unexpected state.',
          );

        const nextOrderVersion = current.order.version + 1;
        await operations.applyFulfillmentRelease({
          current,
          target: input.target,
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
        return result.err(
          orderError(
            'FULFILLMENT_NOT_FOUND',
            'The fulfillment was not found.',
            404,
          ),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'FULFILLMENT_VERSION_CONFLICT',
            'The Order or fulfillment changed after this request was prepared. Refresh and try again.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'FULFILLMENT_TRANSITION_INVALID',
            'The requested fulfillment command is not allowed from the current release state.',
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
          'FULFILLMENT_RELEASE_COMMAND_FAILED',
          'The fulfillment release command could not be completed.',
          503,
          error,
        ),
      );
    }
  };

export const makeReleaseFulfillment = (deps: {
  repo: ChangeFulfillmentReleaseRepository;
  clock: OrderClockPort;
}): ReleaseFulfillment =>
  makeFulfillmentReleaseCommand<ReleaseFulfillmentCommand>({
    ...deps,
    event: { type: 'release' },
    target: 'released',
    allowedReasonCodes: releaseFulfillmentReasonCodes,
  });

export const makeWithdrawFulfillment = (deps: {
  repo: ChangeFulfillmentReleaseRepository;
  clock: OrderClockPort;
}): WithdrawFulfillment =>
  makeFulfillmentReleaseCommand<WithdrawFulfillmentCommand>({
    ...deps,
    event: { type: 'withdraw' },
    target: 'withdrawn',
    allowedReasonCodes: withdrawFulfillmentReasonCodes,
  });

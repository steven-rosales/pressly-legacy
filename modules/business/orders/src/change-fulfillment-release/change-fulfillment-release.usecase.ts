import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import { orderError } from '../order.error.ts';
import { fulfillmentReleaseAuthorityField } from '../order-field-authority.policy.ts';
import { mayTransitionFulfillment } from '../order-lifecycle.policy.ts';
import type {
  ChangeFulfillmentRelease,
  OrderClockPort,
} from '../orders.port.ts';
import type { ChangeFulfillmentReleaseRepository } from './change-fulfillment-release.port.ts';

export const makeChangeFulfillmentRelease =
  (deps: {
    repo: ChangeFulfillmentReleaseRepository;
    clock: OrderClockPort;
  }): ChangeFulfillmentRelease =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.fulfillmentId.trim() === '' ||
      command.locationId.trim() === '' ||
      command.expectedVersion < 1
    )
      return result.err(
        orderError(
          'FULFILLMENT_RELEASE_CHANGE_INVALID',
          'The fulfillment release change is incomplete.',
          400,
        ),
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

        await operations.lockFulfillment(command.fulfillmentId);
        const current = await operations.loadFulfillmentOrder(
          command.fulfillmentId,
        );
        if (
          current === null ||
          current.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        if (current.fulfillment.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        if (
          !mayTransitionFulfillment(
            current.fulfillment.releaseState,
            command.target,
          )
        )
          return { kind: 'invalid_transition' as const };

        const nextOrderVersion = current.order.version + 1;
        await operations.applyFulfillmentRelease({
          current,
          target: command.target,
          authorityField: fulfillmentReleaseAuthorityField(
            current.fulfillment.typeCode,
          ),
          nextOrderVersion,
          nextFulfillmentVersion: current.fulfillment.version + 1,
          now,
        });
        const value = {
          orderId: current.order.id,
          fulfillmentId: current.fulfillment.id,
          version: nextOrderVersion,
          replayed: false,
        };
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
            'The fulfillment changed after this request was prepared. Refresh and try again.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'FULFILLMENT_TRANSITION_INVALID',
            'A withdrawn fulfillment cannot be released again.',
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
          'FULFILLMENT_RELEASE_CHANGE_FAILED',
          'The fulfillment release could not be changed.',
          503,
          error,
        ),
      );
    }
  };

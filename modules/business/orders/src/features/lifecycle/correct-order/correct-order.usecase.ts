import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { isOrderCommandReasonValid } from '../../../foundations/language/command-execution/order-command-reason.policy.ts';

import type {
  CorrectOrder,
  CorrectOrderRepository,
} from './correct-order.port.ts';
import {
  correctOrderReasonCodes,
  decideOrderCorrection,
} from './correct-order.policy.ts';
import { correctOrderFailure } from './correct-order.failure.ts';

export const makeCorrectOrder =
  (deps: { repo: CorrectOrderRepository; clock: Clock }): CorrectOrder =>
  async (command) => {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.locationId.trim() === '' ||
      command.orderId.trim() === '' ||
      command.expectedOrderVersion < 1 ||
      command.expectedFulfillmentVersion < 1 ||
      !isOrderCommandReasonValid({
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote,
        allowedReasonCodes: correctOrderReasonCodes,
      })
    )
      return result.err(correctOrderFailure.invalid());
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

        await operations.lockOrder(command.businessId, command.orderId);
        const candidate = await operations.loadOrder(
          command.businessId,
          command.orderId,
        );
        if (
          candidate === null ||
          candidate.fulfillment.locationId !== command.locationId
        )
          return { kind: 'not_found' as const };
        await operations.lockFulfillment(
          command.businessId,
          candidate.fulfillment.id,
        );
        const current = await operations.loadOrder(
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
        if (
          command.changes.customer?.resolution === 'resolved' &&
          !(await operations.customerExists(
            command.businessId,
            command.changes.customer.userId,
          ))
        )
          return { kind: 'customer_not_found' as const };

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
        await operations.applyOrderCorrection({
          current,
          changes: command.changes,
          nextFulfillment: {
            ...current.fulfillment,
            ...decision.nextFulfillment,
            version: nextFulfillmentVersion,
          },
          nextOrderVersion,
          nextFulfillmentVersion,
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
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          value,
          now,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(correctOrderFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(correctOrderFailure.versionConflict());
      if (outcome.kind === 'customer_not_found')
        return result.err(correctOrderFailure.customerNotFound());
      if (outcome.kind === 'correction_denied')
        return result.err(
          outcome.reason === 'invalid'
            ? correctOrderFailure.invalid()
            : outcome.reason === 'location_move'
              ? correctOrderFailure.locationMove()
              : correctOrderFailure.fulfillmentCommitment(),
        );
      return result.err(correctOrderFailure.idempotencyConflict());
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_correction_failed',
          message: 'The order could not be corrected.',
          safeMessage: 'The order could not be corrected.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

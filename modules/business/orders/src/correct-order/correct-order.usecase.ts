import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
  validationError,
} from '@pressly/errors';
import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../command-execution/order-command-idempotency.policy.ts';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';
import { isOrderCommandReasonValid } from '../command-execution/order-command-reason.policy.ts';

import type {
  CorrectOrder,
  CorrectOrderRepository,
} from './correct-order.port.ts';
import {
  correctOrderReasonCodes,
  decideOrderCorrection,
} from './correct-order.policy.ts';

export const makeCorrectOrder =
  (deps: {
    repo: CorrectOrderRepository;
    clock: OrderClockPort;
  }): CorrectOrder =>
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
      return result.err(
        validationError({
          code: 'order_correction_invalid',
          message: 'The order correction is incomplete.',
          safeMessage: 'The order correction is incomplete.',
        }),
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
        return result.err(
          notFoundError({
            code: 'order_not_found',
            message: 'The order was not found.',
            safeMessage: 'The order was not found.',
          }),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          conflictError({
            code: 'order_version_conflict',
            message:
              'The Order or fulfillment changed after this correction was prepared. Refresh and try again.',
            safeMessage:
              'The Order or fulfillment changed after this correction was prepared. Refresh and try again.',
          }),
        );
      if (outcome.kind === 'customer_not_found')
        return result.err(
          notFoundError({
            code: 'order_customer_not_found',
            message: 'The selected customer was not found.',
            safeMessage: 'The selected customer was not found.',
          }),
        );
      if (outcome.kind === 'correction_denied')
        return result.err(
          outcome.reason === 'invalid'
            ? validationError({
                code: 'order_correction_invalid',
                message: 'The order correction is incomplete.',
                safeMessage: 'The order correction is incomplete.',
              })
            : outcome.reason === 'location_move'
              ? conflictError({
                  code: 'order_location_move_requires_command',
                  message:
                    'Moving an Order to another location requires a dedicated cross-location command.',
                  safeMessage:
                    'Moving an Order to another location requires a dedicated cross-location command.',
                })
              : conflictError({
                  code: 'fulfillment_commitment_conflict',
                  message:
                    'A released fulfillment cannot change its type or location.',
                  safeMessage:
                    'A released fulfillment cannot change its type or location.',
                }),
        );
      return result.err(
        conflictError({
          code: 'order_idempotency_conflict',
          message: 'The idempotency key belongs to a different order command.',
          safeMessage:
            'The idempotency key belongs to a different order command.',
        }),
      );
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_correction_failed',
            message: 'The order could not be corrected.',
            safeMessage: 'The order could not be corrected.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };

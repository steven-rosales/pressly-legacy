import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../command-execution/order-command-idempotency.policy.ts';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';
import { isOrderCommandReasonValid } from '../command-execution/order-command-reason.policy.ts';
import { orderError } from '../failure-mapping/order.error.ts';
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
        orderError(
          'ORDER_CORRECTION_INVALID',
          'The order correction is incomplete.',
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
          orderError('ORDER_NOT_FOUND', 'The order was not found.', 404),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'ORDER_VERSION_CONFLICT',
            'The Order or fulfillment changed after this correction was prepared. Refresh and try again.',
          ),
        );
      if (outcome.kind === 'customer_not_found')
        return result.err(
          orderError(
            'ORDER_CUSTOMER_NOT_FOUND',
            'The selected customer was not found.',
            404,
          ),
        );
      if (outcome.kind === 'correction_denied')
        return result.err(
          outcome.reason === 'invalid'
            ? orderError(
                'ORDER_CORRECTION_INVALID',
                'The order correction is incomplete.',
                400,
              )
            : outcome.reason === 'location_move'
              ? orderError(
                  'ORDER_LOCATION_MOVE_REQUIRES_COMMAND',
                  'Moving an Order to another location requires a dedicated cross-location command.',
                  409,
                )
              : orderError(
                  'FULFILLMENT_COMMITMENT_CONFLICT',
                  'A released fulfillment cannot change its type or location.',
                  409,
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
          'ORDER_CORRECTION_FAILED',
          'The order could not be corrected.',
          503,
          error,
        ),
      );
    }
  };

import { isJsonValue } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  fulfillmentDemandChangedV2MessageContract,
  fulfillmentDemandChangedV2Type,
} from '../../../contracts/fulfillment-demand-changed-v2.ts';
import type {
  ClaimedOrderOutboxEvent,
  FulfillmentDemandChangedEvent,
  OrderOutboxValidationError,
} from '../../../model/order-outbox/model.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';

export type StoredOrderOutboxEvent =
  OrdersSchema['orderOutboxEvents']['$inferSelect'];

type DecodeStoredFulfillmentDemandResult =
  | Readonly<{
      kind: 'valid';
      event: FulfillmentDemandChangedEvent;
    }>
  | Readonly<{
      kind: 'invalid';
      validationError: OrderOutboxValidationError;
    }>;

export const decodeStoredFulfillmentDemand = (input: {
  eventType: string;
  payload: unknown;
  fulfillmentId: string;
  aggregateVersion: number;
}): DecodeStoredFulfillmentDemandResult => {
  if (input.eventType !== fulfillmentDemandChangedV2Type)
    return { kind: 'invalid', validationError: 'unsupported_event_type' };

  const decoded = fulfillmentDemandChangedV2MessageContract.payload.decode(
    input.payload,
  );
  if (decoded.kind === 'invalid')
    return { kind: 'invalid', validationError: 'invalid_payload' };

  if (
    decoded.value.fulfillmentId !== input.fulfillmentId ||
    decoded.value.version !== input.aggregateVersion
  )
    return { kind: 'invalid', validationError: 'aggregate_mismatch' };

  return {
    kind: 'valid',
    event: {
      ...decoded.value,
      dueAt: new Date(decoded.value.dueAt),
      observedAt: new Date(decoded.value.observedAt),
    },
  };
};

export const claimedOrderOutboxEventFromRow = (
  row: StoredOrderOutboxEvent,
  lease: Readonly<{ owner: string; expiresAt: Date }>,
): ClaimedOrderOutboxEvent => {
  if (!isJsonValue(row.payload))
    throw invariantViolationError({
      code: 'order_outbox_payload_invalid_json',
      message: 'Stored order outbox payload is not valid JSON.',
      safeMessage: 'Stored order outbox data is inconsistent.',
    });

  const base = {
    id: row.id,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId,
    aggregateVersion: row.aggregateVersion,
    attempts: row.attempts,
    leaseOwner: lease.owner,
    leaseExpiresAt: lease.expiresAt,
  };
  const decoded = decodeStoredFulfillmentDemand({
    eventType: row.eventType,
    payload: row.payload,
    fulfillmentId: row.fulfillmentId,
    aggregateVersion: row.aggregateVersion,
  });

  if (decoded.kind === 'invalid')
    return {
      ...base,
      kind: 'invalid',
      eventType: row.eventType,
      payload: row.payload,
      validationError: decoded.validationError,
    };

  return {
    ...base,
    kind: 'fulfillment_demand_changed',
    eventType: fulfillmentDemandChangedV2Type,
    payload: decoded.event,
  };
};

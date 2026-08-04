import { isJsonValue } from '@pressly/codec';
import type * as schema from '@pressly/db/schema/orders';
import { invariantViolationError } from '@pressly/errors/factories';
import { fromSerializedFulfillmentDemandEvent } from '../../../foundations/adapters/outbox/fulfillment-demand-codec/fulfillment-demand.contract.mapper.ts';
import {
  fulfillmentDemandChangedEventType,
  type OrderOutboxEvent,
} from '../../../foundations/language/order-outbox/order-outbox.model.ts';

type StoredOrderOutboxEvent = typeof schema.orderOutboxEvents.$inferSelect;

export const claimedOrderOutboxEventFromRow = (
  row: StoredOrderOutboxEvent,
  lease: Readonly<{ owner: string; expiresAt: Date }>,
): OrderOutboxEvent => {
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
  const decoded = fromSerializedFulfillmentDemandEvent({
    eventType: row.eventType,
    payload: row.payload,
    fulfillmentId: row.fulfillmentId,
    aggregateVersion: row.aggregateVersion,
  });

  if (decoded.tag === 'invalid')
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
    eventType: fulfillmentDemandChangedEventType,
    payload: decoded.event,
  };
};

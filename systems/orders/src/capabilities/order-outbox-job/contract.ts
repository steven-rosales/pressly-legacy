import type { ClaimedDurableJobDelivery } from '@pressly/jobs';
import type { ClaimedOrderOutboxEvent } from '../../model/order-outbox/model.ts';

export type OrderOutboxDeliveryReceipt = Readonly<{
  eventId: string;
  workerId: string;
}>;

export type OrderOutboxDurableJobDelivery = ClaimedDurableJobDelivery &
  Readonly<{ receipt: OrderOutboxDeliveryReceipt }>;

export type ToOrderOutboxDurableJobDelivery = (
  event: ClaimedOrderOutboxEvent,
) => OrderOutboxDurableJobDelivery;

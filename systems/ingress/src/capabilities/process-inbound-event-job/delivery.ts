import type { ClaimedDurableJobDelivery } from '@pressly/jobs';
import { processInboundEventContract } from '../../cells/processing/process-inbound-event/contract.ts';
import type { WebhookEventReadyV1 } from '../../contracts/webhook-event-ready-v1.ts';
import type { ClaimedWebhookEvent } from '../../model/inbox.ts';

export type WebhookIngestionDeliveryReceipt = Readonly<{
  eventId: string;
  workerId: string;
  attempt: number;
  recoveredLease: boolean;
  source: string;
}>;

export type WebhookIngestionDurableJobDelivery = ClaimedDurableJobDelivery &
  Readonly<{ receipt: WebhookIngestionDeliveryReceipt }>;

export const toWebhookEventReady = (
  event: ClaimedWebhookEvent,
): WebhookEventReadyV1 =>
  Object.freeze({
    eventId: event.eventId,
    source: event.source,
    eventType: event.eventType,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    sourceLocationId: event.sourceLocationId,
    sourceOccurredAt: event.sourceOccurredAt,
    receivedAt: event.receivedAt,
    payload: event.payload,
    payloadHash: event.payloadHash,
  });

export const toWebhookIngestionDurableJobDelivery = (
  event: ClaimedWebhookEvent,
): WebhookIngestionDurableJobDelivery =>
  Object.freeze({
    id: event.eventId,
    attempt: event.attempt,
    receipt: Object.freeze({
      eventId: event.eventId,
      workerId: event.workerId,
      attempt: event.attempt,
      recoveredLease: event.recoveredLease,
      source: event.source,
    }),
    resolution: Object.freeze({
      kind: 'invoke' as const,
      payload: processInboundEventContract.input.encode(
        toWebhookEventReady(event),
      ),
    }),
  });

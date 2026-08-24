import type { ClaimedWebhookEvent } from '@pressly/ingress-system/models/inbox';
import { processInboundEventContract } from '@pressly/ingress-system/operations/processing/process-inbound-event/contract';
import { describe, expect, it } from 'vitest';
import {
  toWebhookEventReady,
  toWebhookIngestionDurableJobDelivery,
} from './delivery.ts';

const claimedEvent = (
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: '83000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 2,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payload: { status: 'SUBMITTED' },
  payloadHash: 'a'.repeat(64),
  recoveredLease: true,
  ...overrides,
});

describe('webhook ingestion durable delivery', () => {
  it('separates the canonical business event from the opaque queue receipt', () => {
    const delivery = toWebhookIngestionDurableJobDelivery(claimedEvent());

    expect(delivery).toEqual({
      id: '83000000-0000-4000-8000-000000000001',
      attempt: 2,
      receipt: {
        eventId: '83000000-0000-4000-8000-000000000001',
        workerId: 'worker-1',
        attempt: 2,
        recoveredLease: true,
        source: 'cents',
      },
      resolution: {
        kind: 'invoke',
        payload: {
          eventId: '83000000-0000-4000-8000-000000000001',
          source: 'cents',
          eventType: 'order_updated',
          subjectType: 'order',
          subjectId: 'order-1',
          sourceLocationId: 'store-1',
          sourceOccurredAt: '2026-07-10T13:00:00.000Z',
          receivedAt: '2026-07-10T13:00:01.000Z',
          payload: { status: 'SUBMITTED' },
          payloadHash: 'a'.repeat(64),
        },
      },
    });
    expect(Object.isFrozen(delivery)).toBe(true);
    expect(Object.isFrozen(delivery.receipt)).toBe(true);
    expect(Object.isFrozen(delivery.resolution)).toBe(true);
    expect(delivery.resolution).not.toMatchObject({
      payload: expect.objectContaining({
        workerId: expect.anything(),
        attempt: expect.anything(),
        recoveredLease: expect.anything(),
      }),
    });
  });

  it('round-trips the serialized payload through the public reaction contract', () => {
    const event = claimedEvent({
      sourceOccurredAt: null,
      recoveredLease: false,
    });
    const delivery = toWebhookIngestionDurableJobDelivery(event);
    if (delivery.resolution.kind !== 'invoke') return;

    expect(
      processInboundEventContract.input.decode(delivery.resolution.payload),
    ).toEqual({
      kind: 'valid',
      value: toWebhookEventReady(event),
    });
  });
});

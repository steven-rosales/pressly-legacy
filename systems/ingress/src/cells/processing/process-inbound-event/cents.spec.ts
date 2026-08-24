import type { CentsSubmittedOrderCandidatePayload } from '../../../contracts/cents-v1.ts';
import type { WebhookEventReadyV1 } from '../../../contracts/webhook-event-ready-v1.ts';
import { describe, expect, it } from 'vitest';
import {
  decideCentsInboundEvent,
  deriveCentsWeightLbs,
  inboundEventConsumerKey,
  toProposeIncomingOrderCommand,
} from './cents.ts';

const submitted = (): CentsSubmittedOrderCandidatePayload => ({
  externalOrderId: 'order-1',
  orderCode: '00123',
  externalStoreId: 'store-1',
  status: 'SUBMITTED',
  dueAt: '2026-07-10T20:00:00.000Z',
  sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
  bagCount: null,
  totalAmountCents: 14_800,
  balanceDueCents: 14_800,
  services: [
    {
      externalServiceId: 'wash-fold',
      name: 'Wash and fold',
      category: 'LAUNDRY',
      quantity: 1,
      totalPriceCents: 14_800,
      unitPriceCents: 200,
    },
  ],
  customer: {
    externalUserId: 'customer-1',
    firstName: 'Fixture',
    lastName: 'Customer',
    phone: '+15550000000',
    businessName: null,
    email: null,
  },
});

const event = (
  overrides: Partial<WebhookEventReadyV1> = {},
): WebhookEventReadyV1 => ({
  eventId: '83000000-0000-4000-8000-000000000001',
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payloadHash: 'a'.repeat(64),
  payload: submitted(),
  ...overrides,
});

describe('Cents claimed-event decision', () => {
  it('uses exact source plus subject dispatch identity', () => {
    expect(inboundEventConsumerKey(event())).toBe('cents:order');
    expect(decideCentsInboundEvent(event({ subjectType: 'customer' }))).toEqual(
      { kind: 'ignore' },
    );
    expect(
      decideCentsInboundEvent(event({ subjectType: 'marketing' })),
    ).toEqual({ kind: 'ignore' });
    expect(decideCentsInboundEvent(event({ source: 'unknown' }))).toEqual({
      kind: 'reject',
      failure: expect.objectContaining({
        classification: 'missing_consumer',
        code: 'webhook_event_consumer_missing',
        message: 'No consumer is registered for unknown:order.',
        safeMessage: 'No consumer is registered for this webhook event.',
        retryable: false,
      }),
    });
  });

  it.each([
    'READY_FOR_PICKUP',
    'PICKED_UP',
    'IN_PROGRESS',
    'READY_FOR_RETURN',
    'OUT_FOR_DELIVERY',
    'CANCELLED',
  ] as const)('ignores legacy queued status %s', (status) => {
    expect(
      decideCentsInboundEvent(event({ payload: { ...submitted(), status } })),
    ).toEqual({ kind: 'ignore' });
  });

  it('ignores malformed legacy payload without a processable status', () => {
    expect(
      decideCentsInboundEvent(event({ payload: { malformed: true } })),
    ).toEqual({ kind: 'ignore' });
  });

  it.each([
    ['COMPLETED', 'completed'],
    ['CANCELED', 'canceled'],
  ] as const)(
    'maps terminal status %s to source close %s',
    (status, terminalCode) => {
      const payload = {
        externalOrderId: 'order-1',
        externalStoreId: 'store-1',
        status,
        sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
      };
      expect(decideCentsInboundEvent(event({ payload }))).toEqual({
        kind: 'close',
        command: {
          context: {
            origin: 'cents',
            principal: { kind: 'system', id: 'cents-webhook' },
          },
          source: 'cents',
          externalOrderId: 'order-1',
          terminalCode,
          revision: {
            at: new Date('2026-07-10T13:00:00.000Z'),
            hash: 'a'.repeat(64),
            adapterVersion: 'cents-webhook-v3',
            observedAt: new Date('2026-07-10T13:00:01.000Z'),
            normalizedPayload: payload,
          },
        },
      });
    },
  );

  it.each([
    {
      name: 'malformed terminal payload',
      input: event({ payload: { status: 'COMPLETED', malformed: true } }),
      code: 'cents_order_payload_invalid',
    },
    {
      name: 'inconsistent order identity',
      input: event({
        subjectId: 'different-order',
        payload: {
          externalOrderId: 'order-1',
          externalStoreId: 'store-1',
          status: 'CANCELED',
          sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
        },
      }),
      code: 'cents_order_identity_invalid',
    },
    {
      name: 'inconsistent revision',
      input: event({
        sourceOccurredAt: new Date('2026-07-10T13:00:02.000Z'),
        payload: {
          externalOrderId: 'order-1',
          externalStoreId: 'store-1',
          status: 'COMPLETED',
          sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
        },
      }),
      code: 'cents_order_revision_invalid',
    },
    {
      name: 'malformed submitted payload',
      input: event({ payload: { status: 'SUBMITTED', malformed: true } }),
      code: 'cents_order_payload_invalid',
    },
  ])('rejects $name permanently', ({ input, code }) => {
    expect(decideCentsInboundEvent(input)).toEqual({
      kind: 'reject',
      failure: expect.objectContaining({
        classification: 'stored_event',
        code,
        retryable: false,
        status: 422,
      }),
    });
  });
});

describe('Cents submitted proposal translation', () => {
  it('maps the exact source-neutral proposal and revision', () => {
    const incoming = submitted();
    const command = toProposeIncomingOrderCommand({
      event: event({ payload: incoming }),
      order: incoming,
      locationId: 'location-1',
    });
    expect(command).toEqual({
      context: {
        origin: 'cents',
        principal: { kind: 'system', id: 'cents-webhook' },
      },
      source: 'cents',
      externalOrderId: 'order-1',
      proposalKind: 'submitted_order',
      revision: {
        at: new Date('2026-07-10T13:00:00.000Z'),
        hash: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v3',
        observedAt: new Date('2026-07-10T13:00:01.000Z'),
        normalizedPayload: incoming,
      },
      snapshot: {
        customer: {
          externalUserId: 'customer-1',
          firstName: 'Fixture',
          lastName: 'Customer',
          phone: '+15550000000',
          businessName: null,
          email: null,
          normalizedPayload: { externalUserId: 'customer-1' },
        },
        displayNumber: '00123',
        dueAt: new Date('2026-07-10T20:00:00.000Z'),
        currency: 'USD',
        totalAmountCents: 14_800,
        balanceDueCents: 14_800,
        items: [
          {
            lineKey: 'wash-fold',
            itemType: 'service',
            code: 'LAUNDRY',
            description: 'Wash and fold',
            quantity: 1,
            unit: 'service_unit',
            unitPriceCents: 200,
            totalAmountCents: 14_800,
            sourceMetadata: {},
          },
        ],
        fulfillment: {
          typeCode: 'wash_fold',
          locationId: 'location-1',
          estimatedWeightLbs: 74,
          estimatedWeightSource: 'source_estimate',
        },
      },
    });
  });

  it('preserves null customer and maps non-laundry work without pounds', () => {
    const incoming: CentsSubmittedOrderCandidatePayload = {
      ...submitted(),
      customer: null,
      services: [
        {
          externalServiceId: 'dry-cleaning',
          name: 'Dry cleaning',
          category: 'DRY_CLEANING',
          quantity: 1,
          totalPriceCents: 2_250,
          unitPriceCents: 150,
        },
      ],
    };
    expect(
      toProposeIncomingOrderCommand({
        event: event({ payload: incoming }),
        order: incoming,
        locationId: 'location-1',
      }).snapshot,
    ).toMatchObject({
      customer: null,
      fulfillment: {
        typeCode: 'external_order',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      },
    });
  });

  it('derives only laundry pounds and rounds the aggregate to three decimals', () => {
    expect(
      deriveCentsWeightLbs([
        ...submitted().services,
        {
          externalServiceId: 'laundry-fraction',
          name: 'Laundry fraction',
          category: 'LAUNDRY',
          quantity: 1,
          totalPriceCents: 100,
          unitPriceCents: 300,
        },
        {
          externalServiceId: 'dry-cleaning',
          name: 'Dry cleaning',
          category: 'DRY_CLEANING',
          quantity: 1,
          totalPriceCents: 2_250,
          unitPriceCents: 150,
        },
      ]),
    ).toBe(74.333);
  });
});

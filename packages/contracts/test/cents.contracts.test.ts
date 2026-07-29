import { describe, expect, it } from 'vitest';
import {
  centsIngressDecisionSchema,
  centsOrderTerminalClosePayloadSchema,
  centsOrderWireSchema,
  centsOrderWebhookEventKindSchema,
  centsSubmittedOrderCandidatePayloadSchema,
  centsWebhookWireEnvelopeSchema,
} from '../src/cents/cents.contracts.ts';

describe('Cents wire contracts', () => {
  it('accepts the documented action alias without synthetic receipt fields', () => {
    expect(
      centsWebhookWireEnvelopeSchema.parse({
        action: 'order_updated',
        order: { id: 123, storeId: 24 },
        vendorFutureField: { enabled: true },
      }),
    ).toMatchObject({ action: 'order_updated' });
  });

  it('accepts the documented event alias and retains forward-compatible data', () => {
    expect(
      centsWebhookWireEnvelopeSchema.parse({
        event: 'customer_created',
        customer: { id: 815, future: 'value' },
      }),
    ).toMatchObject({
      event: 'customer_created',
      customer: { id: 815, future: 'value' },
    });
  });

  it('rejects an envelope without action or event', () => {
    expect(() => centsWebhookWireEnvelopeSchema.parse({ order: {} })).toThrow();
  });

  it.each(['order_created', 'order_updated', 'order_completed'])(
    'classifies the documented order event %s',
    (eventKind) => {
      expect(centsOrderWebhookEventKindSchema.parse(eventKind)).toBe(eventKind);
    },
  );

  it('accepts future vendor status text at the wire boundary', () => {
    expect(
      centsOrderWireSchema.parse({
        id: 'order-1',
        storeId: 'store-1',
        status: 'FUTURE_VENDOR_STATUS',
        dueDate: '2026-07-10T20:00:00.000Z',
        updatedAt: '2026-07-10T14:00:00.000Z',
      }).status,
    ).toBe('FUTURE_VENDOR_STATUS');
  });
});

describe('Cents order-candidate ingress contracts', () => {
  const order = {
    externalOrderId: '12345',
    orderCode: '00123',
    externalStoreId: '24',
    status: 'SUBMITTED',
    dueAt: '2026-07-10T20:00:00.000Z',
    sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
    bagCount: null,
    totalAmountCents: 2999,
    balanceDueCents: 2499,
    services: [
      {
        externalServiceId: '43',
        name: 'Wash and Fold',
        category: 'LAUNDRY',
        quantity: 1,
        totalPriceCents: 2999,
        unitPriceCents: 200,
      },
    ],
    customer: null,
  };

  it('requires missing bag count to remain explicit', () => {
    expect(
      centsSubmittedOrderCandidatePayloadSchema.parse(order).bagCount,
    ).toBeNull();
    expect(() =>
      centsSubmittedOrderCandidatePayloadSchema.parse({
        ...order,
        bagCount: 0,
      }),
    ).toThrow();
  });

  it('rejects vendor aliases and undeclared candidate fields', () => {
    expect(() =>
      centsSubmittedOrderCandidatePayloadSchema.parse({
        ...order,
        dueDate: order.dueAt,
      }),
    ).toThrow();
    expect(() =>
      centsSubmittedOrderCandidatePayloadSchema.parse({
        ...order,
        sourceVersion: 1,
      }),
    ).toThrow();
  });

  it('allows only exact submitted status in the queued candidate contract', () => {
    expect(() =>
      centsSubmittedOrderCandidatePayloadSchema.parse({
        ...order,
        status: 'PICKED_UP',
      }),
    ).toThrow();
  });

  it.each(['COMPLETED', 'CANCELED'] as const)(
    'accepts the exact terminal close status %s',
    (status) => {
      expect(
        centsOrderTerminalClosePayloadSchema.parse({
          externalOrderId: '12345',
          externalStoreId: '24',
          status,
          sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
        }),
      ).toMatchObject({ status });
    },
  );

  it('keeps terminal close payloads minimal and exact', () => {
    expect(() =>
      centsOrderTerminalClosePayloadSchema.parse({
        externalOrderId: '12345',
        externalStoreId: '24',
        status: 'CANCELLED',
        sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      centsOrderTerminalClosePayloadSchema.parse({
        externalOrderId: '12345',
        externalStoreId: '24',
        status: 'COMPLETED',
        sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
        dueAt: '2026-07-10T20:00:00.000Z',
      }),
    ).toThrow();
  });

  it('parses both processable order decisions', () => {
    const receipt = {
      deduplicationKey: 'a'.repeat(64),
      eventKind: 'order_updated',
      classification: 'order' as const,
      rawBodySha256: 'b'.repeat(64),
      sourceUpdatedAt: order.sourceUpdatedAt,
    };
    const terminal = {
      externalOrderId: order.externalOrderId,
      externalStoreId: order.externalStoreId,
      status: 'COMPLETED' as const,
      sourceUpdatedAt: order.sourceUpdatedAt,
    };

    expect(
      centsIngressDecisionSchema.parse({
        disposition: 'propose_order_candidate',
        receipt,
        order,
      }),
    ).toMatchObject({ disposition: 'propose_order_candidate' });
    expect(
      centsIngressDecisionSchema.parse({
        disposition: 'close_order_candidate',
        receipt,
        order: terminal,
      }),
    ).toMatchObject({ disposition: 'close_order_candidate' });
  });

  it('keeps unknown ignored decisions minimized and strict', () => {
    const ignored = {
      disposition: 'ignore',
      receipt: {
        deduplicationKey: 'a'.repeat(64),
        eventKind: 'future_event',
        classification: 'unknown',
        rawBodySha256: 'b'.repeat(64),
        sourceUpdatedAt: null,
      },
      reason: 'unsupported_event',
    };

    expect(centsIngressDecisionSchema.parse(ignored)).toEqual(ignored);
    expect(() =>
      centsIngressDecisionSchema.parse({
        ...ignored,
        customer: { id: 'customer-fixture' },
      }),
    ).toThrow();
  });
});

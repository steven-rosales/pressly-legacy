import { describe, expect, it } from 'vitest';
import {
  centsCanonicalOrderInputSchema,
  centsIngressDecisionSchema,
  centsOrderWebhookEventKindSchema,
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
});

describe('canonical Cents ingress contracts', () => {
  const order = {
    externalOrderId: '12345',
    orderCode: '00123',
    externalStoreId: '24',
    status: 'IN_PROGRESS',
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
        sourceMetadata: {},
      },
    ],
    customer: null,
    sourceSnapshot: {},
  };

  it('requires missing bag count to remain explicit', () => {
    expect(centsCanonicalOrderInputSchema.parse(order).bagCount).toBeNull();
    expect(() =>
      centsCanonicalOrderInputSchema.parse({ ...order, bagCount: 0 }),
    ).toThrow();
  });

  it('rejects vendor aliases and undeclared canonical fields', () => {
    expect(() =>
      centsCanonicalOrderInputSchema.parse({ ...order, dueDate: order.dueAt }),
    ).toThrow();
    expect(() =>
      centsCanonicalOrderInputSchema.parse({ ...order, sourceVersion: 1 }),
    ).toThrow();
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

  it('requires supported customer observations to remain processable', () => {
    const projected = {
      disposition: 'project_customer',
      receipt: {
        deduplicationKey: 'a'.repeat(64),
        eventKind: 'customer_updated',
        classification: 'customer',
        rawBodySha256: 'b'.repeat(64),
        sourceUpdatedAt: null,
      },
      customer: {
        externalUserId: 'customer-1',
        centsCustomerId: '815',
        firstName: 'Fixture',
        lastName: null,
        phone: null,
        businessName: null,
        email: null,
        isCommercial: false,
        isInvoicingEnabled: false,
        referralCode: null,
        sourceUpdatedAt: null,
        sourceSnapshot: {},
      },
    };

    expect(centsIngressDecisionSchema.parse(projected)).toEqual(projected);
  });
});

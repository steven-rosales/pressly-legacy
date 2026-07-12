import { createHash } from 'node:crypto';
import { centsIngressDecisionSchema } from '@pressly/contracts';
import { describe, expect, it } from 'vitest';
import {
  CENTS_WEBHOOK_MAX_BODY_BYTES,
  deriveCentsDeduplicationKey,
  normalizeCentsWebhook,
} from '../../src/vendors/cents/cents-webhook.adapter.ts';

const orderPayload = (overrides: Record<string, unknown> = {}) => ({
  action: 'order_updated',
  order: {
    id: 12345,
    storeId: 24,
    status: 'IN_PROGRESS',
    dueDate: '2026-07-10T20:00:00.000Z',
    updatedAt: '2026-07-10T14:00:00.000Z',
  },
  services: [
    {
      id: '43',
      name: 'Wash and Fold',
      quantity: 1,
      totalPrice: 29.99,
      unitCost: 2,
      serviceCategory: 'Wash and Fold',
      serviceCategoryType: 'LAUNDRY',
    },
  ],
  customer: {
    id: 'customer-fixture-123',
    firstName: 'Fixture',
    email: 'fixture@example.invalid',
    phoneNumber: '+15550000000',
  },
  ...overrides,
});

const normalize = (payload: unknown, rawBody?: Uint8Array) =>
  normalizeCentsWebhook({
    payload,
    rawBody: rawBody ?? Buffer.from(JSON.stringify(payload)),
  });

describe('Cents order webhook adapter', () => {
  it('normalizes documented fields and strips unrelated customer PII', () => {
    const result = normalize(orderPayload());

    expect(result).toMatchObject({
      ok: true,
      value: {
        disposition: 'project_order',
        receipt: {
          eventKind: 'order_updated',
          classification: 'order',
          sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
        },
        order: {
          externalOrderId: '12345',
          externalStoreId: '24',
          status: 'IN_PROGRESS',
          dueAt: '2026-07-10T20:00:00.000Z',
          sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
          bagCount: null,
          services: [
            {
              externalServiceId: '43',
              category: 'LAUNDRY',
              totalPriceCents: 2999,
              unitPriceCents: 200,
            },
          ],
        },
      },
    });
    expect(
      centsIngressDecisionSchema.safeParse(result.ok ? result.value : null)
        .success,
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('fixture@example.invalid');
    expect(JSON.stringify(result)).not.toContain('+15550000000');
    expect(JSON.stringify(result)).not.toContain('sourceVersion');
    expect(JSON.stringify(result)).not.toContain('occurredAt');
    expect(JSON.stringify(result)).not.toContain('eventId');
  });

  it.each([
    ['SUBMITTED', 'SUBMITTED'],
    ['READY_FOR_PICKUP', 'READY_FOR_PICKUP'],
    ['PICKED_UP', 'PICKED_UP'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['READY_FOR_RETURN', 'READY_FOR_RETURN'],
    ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
    ['COMPLETED', 'COMPLETED'],
    ['CANCELLED', 'CANCELED'],
    ['CANCELED', 'CANCELED'],
  ] as const)('normalizes order status %s to %s', (wire, canonical) => {
    const base = orderPayload();
    const result = normalize({
      ...base,
      order: { ...(base.order as object), status: wire },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { order: { status: canonical } },
    });
  });

  it.each(['order_created', 'order_updated', 'order_completed'])(
    'accepts the documented order event %s through either alias',
    (eventKind) => {
      const base = orderPayload();
      const actionResult = normalize({ ...base, action: eventKind });
      const { action: _action, ...withoutAction } = base;
      const eventResult = normalize({ ...withoutAction, event: eventKind });

      expect(actionResult).toMatchObject({
        ok: true,
        value: { receipt: { eventKind } },
      });
      expect(eventResult).toMatchObject({
        ok: true,
        value: { receipt: { eventKind } },
      });
    },
  );

  it('accepts services nested in the order and normalizes unitPrice', () => {
    const base = orderPayload();
    const { services, ...withoutServices } = base;
    const result = normalize({
      ...withoutServices,
      event: 'order_updated',
      action: undefined,
      order: {
        ...(base.order as object),
        services: (services as Array<Record<string, unknown>>).map(
          (service) => {
            const { unitCost: _unitCost, ...withoutUnitCost } = service;
            return { ...withoutUnitCost, unitPrice: '2.00' };
          },
        ),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: { order: { services: [{ unitPriceCents: 200 }] } },
    });
  });

  it('converts decimal dollars exactly and permits insignificant trailing zeroes', () => {
    const base = orderPayload();
    const result = normalize({
      ...base,
      services: [
        {
          ...(base.services[0] as object),
          totalPrice: '0.10',
          unitCost: '2.000',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        order: {
          services: [{ totalPriceCents: 10, unitPriceCents: 200 }],
        },
      },
    });
  });

  it('rejects sub-cent currency and conflicting price aliases', () => {
    const base = orderPayload();
    expect(
      normalize({
        ...base,
        services: [{ ...(base.services[0] as object), totalPrice: '1.001' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_cents_money' } });

    expect(
      normalize({
        ...base,
        services: [
          {
            ...(base.services[0] as object),
            unitPrice: 2,
            unitCost: 3,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'conflicting_cents_unit_price' },
    });
  });

  it('rejects conflicting action and event aliases', () => {
    expect(
      normalize({
        ...orderPayload(),
        action: 'order_updated',
        event: 'order_completed',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'conflicting_cents_event_kind' },
    });
  });

  it.each([
    [{ action: 'order_updated' }, 'invalid_cents_order_payload'],
    [
      {
        ...orderPayload(),
        services: undefined,
      },
      'invalid_cents_order_payload',
    ],
  ])('rejects malformed order payloads', (payload, code) => {
    expect(normalize(payload)).toMatchObject({ ok: false, error: { code } });
  });
});

describe('non-production Cents webhook classification', () => {
  it.each([
    ['customer_created', 'customer'],
    ['customer_updated', 'customer'],
    ['customer_marketing_optin', 'marketing'],
  ] as const)(
    'minimizes %s as an ignored %s receipt',
    (event, classification) => {
      const payload = {
        event,
        customer: {
          id: 'customer-fixture-815',
          firstName: 'Private Fixture',
          lastName: 'Data',
          email: 'private@example.invalid',
          phoneNumber: '+15550000001',
        },
        customerMetrics: { totalOrderValue: 447.35 },
      };
      const result = normalize(payload);
      const serialized = JSON.stringify(result);

      expect(result).toMatchObject({
        ok: true,
        value: {
          disposition: 'ignore',
          receipt: { eventKind: event, classification },
          reason: 'non_production_event',
        },
      });
      expect(serialized).not.toContain('customer-fixture-815');
      expect(serialized).not.toContain('Private Fixture');
      expect(serialized).not.toContain('private@example.invalid');
      expect(serialized).not.toContain('+15550000001');
      expect(serialized).not.toContain('customerMetrics');
    },
  );

  it('ignores an unknown future event without retaining its payload', () => {
    const result = normalize({
      event: 'order_rescheduled_v2',
      order: {
        id: 'vendor-private-id',
        updatedAt: '2026-07-10T15:00:00.000Z',
        futurePrivateField: 'must-not-survive',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        disposition: 'ignore',
        receipt: {
          eventKind: 'order_rescheduled_v2',
          classification: 'unknown',
          sourceUpdatedAt: '2026-07-10T15:00:00.000Z',
        },
        reason: 'unsupported_event',
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-survive');
    expect(JSON.stringify(result)).not.toContain('vendor-private-id');
  });

  it('rejects a documented customer event without a customer identity', () => {
    expect(
      normalize({ event: 'customer_updated', customer: {} }),
    ).toMatchObject({
      ok: false,
      error: { code: 'invalid_cents_customer_payload' },
    });
  });
});

describe('Cents receipt identity and limits', () => {
  it('derives stable identity and changes it when any source input changes', () => {
    const identity = {
      eventKind: 'order_updated',
      vendorEntityId: '12345',
      sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
      rawBodySha256: 'a'.repeat(64),
    };
    const first = deriveCentsDeduplicationKey(identity);

    expect(deriveCentsDeduplicationKey(identity)).toBe(first);
    expect(
      deriveCentsDeduplicationKey({
        ...identity,
        sourceUpdatedAt: '2026-07-10T14:00:01.000Z',
      }),
    ).not.toBe(first);
    expect(
      deriveCentsDeduplicationKey({
        ...identity,
        rawBodySha256: 'b'.repeat(64),
      }),
    ).not.toBe(first);
  });

  it('binds the receipt digest and identity to exact raw bytes', () => {
    const payload = orderPayload();
    const firstRawBody = Buffer.from(JSON.stringify(payload));
    const secondRawBody = Buffer.from(`${JSON.stringify(payload)}\n`);
    const first = normalize(payload, firstRawBody);
    const second = normalize(payload, secondRawBody);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) return;

    expect(first.value.receipt.rawBodySha256).toBe(
      createHash('sha256').update(firstRawBody).digest('hex'),
    );
    expect(second.value.receipt.rawBodySha256).not.toBe(
      first.value.receipt.rawBodySha256,
    );
    expect(second.value.receipt.deduplicationKey).not.toBe(
      first.value.receipt.deduplicationKey,
    );
  });

  it('rejects a body over the explicit adapter limit', () => {
    expect(
      normalize(
        { event: 'customer_updated', customer: { id: 1 } },
        new Uint8Array(CENTS_WEBHOOK_MAX_BODY_BYTES + 1),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'cents_webhook_body_too_large' },
    });
  });
});

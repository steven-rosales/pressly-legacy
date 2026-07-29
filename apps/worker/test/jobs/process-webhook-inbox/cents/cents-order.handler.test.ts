import type {
  CentsOrderTerminalClosePayload,
  CentsSubmittedOrderCandidatePayload,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { OrdersWorkerApplication } from '@pressly/orders';
import type { ProductionApplication } from '@pressly/production';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveCentsWeightLbs,
  makeCentsOrderHandler as makeRawCentsOrderHandler,
} from '../../../../src/jobs/process-webhook-inbox/cents/cents-order.handler.ts';

const payload = (): CentsSubmittedOrderCandidatePayload => ({
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
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  receivedAt: '2026-07-10T13:00:01.000Z',
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  payload: payload(),
  ...overrides,
});

const proposalResult = {
  proposalId: '00000000-0000-4000-8000-000000000002',
  version: 1,
  replayed: false,
  outcome: 'proposed',
} as const;

const propose = (
  implementation: OrdersWorkerApplication['proposeIncomingOrder'] = vi.fn(
    async () => ({ tag: 'ok' as const, value: proposalResult }),
  ),
) => implementation;

const close = (
  implementation: OrdersWorkerApplication['closeIncomingOrderSource'] = vi.fn(
    async () => ({
      tag: 'ok' as const,
      value: {
        outcome: 'source_closed' as const,
        proposalId: '00000000-0000-4000-8000-000000000002',
        version: 2,
        canonical: null,
        replayed: false,
      },
    }),
  ),
) => implementation;

const sourceResolution = (
  implementation: ProductionApplication['resolveSourceClosedFulfillment'] = vi.fn(
    async () => ({
      tag: 'ok' as const,
      value: {
        outcome: 'already_resolved' as const,
        locationId: 'location-1',
        fulfillmentId: '00000000-0000-4000-8000-000000000003',
        productionOrderId: '00000000-0000-4000-8000-000000000004',
        version: 2,
      },
    }),
  ),
) => implementation;

type CentsOrderHandlerDeps = Parameters<typeof makeRawCentsOrderHandler>[0];

const makeCentsOrderHandler = (
  deps: Omit<CentsOrderHandlerDeps, 'production'> &
    Partial<Pick<CentsOrderHandlerDeps, 'production'>>,
) =>
  makeRawCentsOrderHandler({
    ...deps,
    production: deps.production ?? {
      resolveSourceClosedFulfillment: sourceResolution(),
    },
  });

const terminalPayload = (
  status: CentsOrderTerminalClosePayload['status'],
): CentsOrderTerminalClosePayload => ({
  externalOrderId: 'order-1',
  externalStoreId: 'store-1',
  status,
  sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
});

describe('Cents order candidate adapter', () => {
  it.each([
    'READY_FOR_PICKUP',
    'PICKED_UP',
    'IN_PROGRESS',
    'READY_FOR_RETURN',
    'OUT_FOR_DELIVERY',
    'CANCELLED',
  ] as const)(
    'acknowledges legacy queued %s without reaching location or Orders',
    async (status) => {
      const resolveSourceLocation = vi.fn(async () => 'location-1');
      const proposeIncomingOrder = propose();
      const closeIncomingOrderSource = close();
      const incoming = payload();
      const consumer = makeCentsOrderHandler({
        resolveSourceLocation,
        orders: { proposeIncomingOrder, closeIncomingOrderSource },
      });

      await expect(
        consumer(event({ payload: { ...incoming, status } })),
      ).resolves.toEqual({ tag: 'ok' });
      expect(resolveSourceLocation).not.toHaveBeenCalled();
      expect(proposeIncomingOrder).not.toHaveBeenCalled();
      expect(closeIncomingOrderSource).not.toHaveBeenCalled();
    },
  );

  it('acknowledges a malformed legacy payload without a processable status', async () => {
    const resolveSourceLocation = vi.fn(async () => 'location-1');
    const proposeIncomingOrder = propose();
    const closeIncomingOrderSource = close();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation,
      orders: { proposeIncomingOrder, closeIncomingOrderSource },
    });

    await expect(
      consumer(event({ payload: { malformed: true } })),
    ).resolves.toEqual({ tag: 'ok' });
    expect(resolveSourceLocation).not.toHaveBeenCalled();
    expect(proposeIncomingOrder).not.toHaveBeenCalled();
    expect(closeIncomingOrderSource).not.toHaveBeenCalled();
  });

  it('submits one source-neutral immutable proposal for exact submitted status', async () => {
    const proposeIncomingOrder = propose();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder,
        closeIncomingOrderSource: close(),
      },
    });

    await expect(consumer(event())).resolves.toEqual({ tag: 'ok' });
    expect(proposeIncomingOrder).toHaveBeenCalledWith({
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
        normalizedPayload: payload(),
      },
      snapshot: {
        customer: {
          externalUserId: 'customer-1',
          firstName: 'Fixture',
          lastName: 'Customer',
          businessName: null,
          phone: '+15550000000',
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

  it('retains a submitted candidate without customer identity', async () => {
    const proposeIncomingOrder = propose();
    const incoming = payload();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder,
        closeIncomingOrderSource: close(),
      },
    });

    await expect(
      consumer(event({ payload: { ...incoming, customer: null } })),
    ).resolves.toEqual({ tag: 'ok' });
    expect(proposeIncomingOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ customer: null }),
      }),
    );
  });

  it.each([
    ['COMPLETED', 'completed'],
    ['CANCELED', 'canceled'],
  ] as const)(
    'closes the matching source record for exact terminal status %s',
    async (status, terminalCode) => {
      const resolveSourceLocation = vi.fn(async () => 'location-1');
      const proposeIncomingOrder = propose();
      const closeIncomingOrderSource = close();
      const terminal = terminalPayload(status);
      const consumer = makeCentsOrderHandler({
        resolveSourceLocation,
        orders: { proposeIncomingOrder, closeIncomingOrderSource },
      });

      await expect(consumer(event({ payload: terminal }))).resolves.toEqual({
        tag: 'ok',
      });
      expect(closeIncomingOrderSource).toHaveBeenCalledWith({
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
          normalizedPayload: terminal,
        },
      });
      expect(resolveSourceLocation).not.toHaveBeenCalled();
      expect(proposeIncomingOrder).not.toHaveBeenCalled();
    },
  );

  it('asks the source-neutral Production guard to resolve exact accepted work', async () => {
    const resolveSourceClosedFulfillment = sourceResolution();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder: propose(),
        closeIncomingOrderSource: close(
          vi.fn(async () => ({
            tag: 'ok' as const,
            value: {
              outcome: 'existing_order' as const,
              proposalId: '00000000-0000-4000-8000-000000000002',
              version: 2,
              canonical: {
                orderId: '00000000-0000-4000-8000-000000000003',
                fulfillmentId: '00000000-0000-4000-8000-000000000004',
                locationId: 'location-1',
                releaseState: 'unreleased' as const,
              },
              replayed: false,
            },
          })),
        ),
      },
      production: { resolveSourceClosedFulfillment },
    });

    await expect(
      consumer(event({ payload: terminalPayload('COMPLETED') })),
    ).resolves.toEqual({ tag: 'ok' });
    expect(resolveSourceClosedFulfillment).toHaveBeenCalledWith({
      locationId: 'location-1',
      fulfillmentId: '00000000-0000-4000-8000-000000000004',
      actorId: '00000000-0000-4000-8000-000000000000',
      idempotencyKey:
        'source-closed-fulfillment:00000000-0000-4000-8000-000000000001',
    });
  });

  it('retries terminal evidence until the accepted fulfillment reaches Production', async () => {
    const resolveSourceClosedFulfillment = sourceResolution(
      vi.fn(async () => ({
        tag: 'ok' as const,
        value: {
          outcome: 'not_found' as const,
          locationId: 'location-1',
          fulfillmentId: '00000000-0000-4000-8000-000000000004',
        },
      })),
    );
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder: propose(),
        closeIncomingOrderSource: close(
          vi.fn(async () => ({
            tag: 'ok' as const,
            value: {
              outcome: 'existing_order' as const,
              proposalId: null,
              version: null,
              canonical: {
                orderId: '00000000-0000-4000-8000-000000000003',
                fulfillmentId: '00000000-0000-4000-8000-000000000004',
                locationId: 'location-1',
                releaseState: 'unreleased' as const,
              },
              replayed: true,
            },
          })),
        ),
      },
      production: { resolveSourceClosedFulfillment },
    });

    await expect(
      consumer(event({ payload: terminalPayload('COMPLETED') })),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: true,
      error: { code: 'production_projection_pending', status: 503 },
    });
  });

  it('acknowledges a guarded review outcome without changing Production', async () => {
    const resolveSourceClosedFulfillment = sourceResolution(
      vi.fn(async () => ({
        tag: 'ok' as const,
        value: {
          outcome: 'review_required' as const,
          locationId: 'location-1',
          fulfillmentId: '00000000-0000-4000-8000-000000000004',
          productionOrderId: '00000000-0000-4000-8000-000000000005',
          version: 2,
          reason: 'operational_review_required' as const,
        },
      })),
    );
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder: propose(),
        closeIncomingOrderSource: close(
          vi.fn(async () => ({
            tag: 'ok' as const,
            value: {
              outcome: 'existing_order' as const,
              proposalId: null,
              version: null,
              canonical: {
                orderId: '00000000-0000-4000-8000-000000000003',
                fulfillmentId: '00000000-0000-4000-8000-000000000004',
                locationId: 'location-1',
                releaseState: 'unreleased' as const,
              },
              replayed: true,
            },
          })),
        ),
      },
      production: { resolveSourceClosedFulfillment },
    });

    await expect(
      consumer(event({ payload: terminalPayload('CANCELED') })),
    ).resolves.toEqual({ tag: 'ok' });
  });

  it('fails permanently for malformed or inconsistent terminal commands', async () => {
    const closeIncomingOrderSource = close();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder: propose(),
        closeIncomingOrderSource,
      },
    });

    await expect(
      consumer(event({ payload: { status: 'COMPLETED', malformed: true } })),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'cents_order_payload_invalid' },
    });
    await expect(
      consumer(
        event({
          payload: terminalPayload('CANCELED'),
          subjectId: 'different-order',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'cents_order_identity_invalid' },
    });
    await expect(
      consumer(
        event({
          payload: terminalPayload('COMPLETED'),
          sourceOccurredAt: '2026-07-10T13:00:02.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'cents_order_revision_invalid' },
    });
    expect(closeIncomingOrderSource).not.toHaveBeenCalled();
  });

  it('derives laundry weight without treating other services as pounds', () => {
    expect(
      deriveCentsWeightLbs([
        ...payload().services,
        {
          externalServiceId: 'dry-cleaning',
          name: 'Dry cleaning',
          category: 'DRY_CLEANING',
          quantity: 1,
          totalPriceCents: 2_250,
          unitPriceCents: 150,
        },
      ]),
    ).toBe(74);
  });

  it('fails permanently for an unmapped candidate or malformed payload', async () => {
    const proposeIncomingOrder = propose();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => null),
      orders: {
        proposeIncomingOrder,
        closeIncomingOrderSource: close(),
      },
    });

    await expect(consumer(event())).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'source_location_unmapped' },
    });
    await expect(
      consumer(event({ payload: { status: 'SUBMITTED', malformed: true } })),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'cents_order_payload_invalid' },
    });
    expect(proposeIncomingOrder).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 503,
      kind: 'DatabaseError',
      code: 'INCOMING_ORDER_PROPOSAL_FAILED',
      retryable: true,
    },
    {
      status: 409,
      kind: 'ConflictError',
      code: 'INCOMING_ORDER_PROPOSAL_CONFLICT',
      retryable: false,
    },
  ] as const)(
    'maps an Orders failure to retryable=$retryable',
    async ({ status, kind, code, retryable }) => {
      const failure = makeAppError({
        kind,
        code,
        message: 'Incoming order proposal failed.',
        safeMessage: 'Incoming order proposal failed.',
        status,
      });
      const consumer = makeCentsOrderHandler({
        resolveSourceLocation: vi.fn(async () => 'location-1'),
        orders: {
          proposeIncomingOrder: propose(
            vi.fn(async () => ({ tag: 'err' as const, error: failure })),
          ),
          closeIncomingOrderSource: close(),
        },
      });

      await expect(consumer(event())).resolves.toMatchObject({
        tag: 'err',
        error: { code },
        retryable,
      });
    },
  );

  it('maps terminal close failures using the same retry policy', async () => {
    const failure = makeAppError({
      kind: 'DatabaseError',
      code: 'INCOMING_ORDER_CLOSE_FAILED',
      message: 'Incoming order close failed.',
      safeMessage: 'Incoming order close failed.',
      status: 503,
    });
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      orders: {
        proposeIncomingOrder: propose(),
        closeIncomingOrderSource: close(
          vi.fn(async () => ({ tag: 'err' as const, error: failure })),
        ),
      },
    });

    await expect(
      consumer(event({ payload: terminalPayload('COMPLETED') })),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'INCOMING_ORDER_CLOSE_FAILED' },
      retryable: true,
    });
  });
});

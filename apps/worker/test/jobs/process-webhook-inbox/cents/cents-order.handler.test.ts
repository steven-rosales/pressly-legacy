import type { CentsCanonicalOrderInput } from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveCentsWeightLbs,
  makeCentsOrderHandler,
} from '../../../../src/jobs/process-webhook-inbox/cents/cents-order.handler.ts';

const payload = (): CentsCanonicalOrderInput => ({
  externalOrderId: 'order-1',
  orderCode: '00123',
  externalStoreId: 'store-1',
  status: 'IN_PROGRESS',
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
      sourceMetadata: { documented: true },
    },
  ],
  customer: {
    externalUserId: 'customer-1',
    centsCustomerId: '815',
    firstName: 'Fixture',
    lastName: 'Customer',
    phone: '+15550000000',
    businessName: null,
    email: null,
    isCommercial: false,
    isInvoicingEnabled: false,
    referralCode: null,
    sourceUpdatedAt: null,
    sourceSnapshot: { customer: { id: 'customer-1' } },
  },
  sourceSnapshot: { order: { id: 'order-1', orderCode: '00123' } },
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

const users = (
  observeSource: UsersApplication['observeSource'] = vi.fn(async () => ({
    tag: 'ok' as const,
    value: { userId: 'user-1', version: 1, outcome: 'created' as const },
  })),
): UsersApplication =>
  ({
    observeSource,
    createUser: vi.fn(),
    updateUser: vi.fn(),
    followSourceField: vi.fn(),
    recordConsent: vi.fn(),
    resolveSource: vi.fn(),
  }) as UsersApplication;

const orders = (
  observeSource = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: 'canonical-order-1',
      fulfillmentId: 'fulfillment-1',
      version: 1,
      replayed: false,
      outcome: 'created' as const,
    },
  })),
): OrdersApplication =>
  ({
    observeSource,
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    changeFulfillmentRelease: vi.fn(),
    claimOutbox: vi.fn(),
    completeOutbox: vi.fn(),
    retryOutbox: vi.fn(),
    deadLetterOutbox: vi.fn(),
  }) as OrdersApplication;

describe('Cents order consumer adapter', () => {
  it('derives laundry weight without treating future service categories as pounds', () => {
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
          sourceMetadata: {},
        },
      ]),
    ).toBe(74);
  });

  it('resolves the exact customer before creating the canonical order', async () => {
    const observeUser = vi.fn(async () => ({
      tag: 'ok' as const,
      value: { userId: 'user-1', version: 1, outcome: 'created' as const },
    }));
    const observeOrder = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        orderId: 'canonical-order-1',
        fulfillmentId: 'fulfillment-1',
        version: 1,
        replayed: false,
        outcome: 'created' as const,
      },
    }));
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      users: users(observeUser),
      orders: orders(observeOrder),
    });

    await expect(consumer(event())).resolves.toEqual({ tag: 'ok' });
    expect(observeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cents',
        externalUserId: 'customer-1',
        profile: expect.objectContaining({
          firstName: 'Fixture',
          phone: '+15550000000',
        }),
      }),
    );
    expect(observeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cents',
        externalOrderId: 'order-1',
        displayNumber: '00123',
        customer: {
          resolution: 'resolved',
          userId: 'user-1',
          externalUserId: 'customer-1',
        },
        fulfillment: expect.objectContaining({
          typeCode: 'wash_fold',
          releaseState: 'released',
          estimatedWeightLbs: 74,
        }),
      }),
    );
    expect(observeUser.mock.invocationCallOrder[0]).toBeLessThan(
      observeOrder.mock.invocationCallOrder[0]!,
    );
  });

  it('retains an order without customer identity and keeps pre-release work advisory', async () => {
    const observeOrder = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        orderId: 'canonical-order-1',
        fulfillmentId: 'fulfillment-1',
        version: 1,
        replayed: false,
        outcome: 'created' as const,
      },
    }));
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      users: users(),
      orders: orders(observeOrder),
    });
    const incoming = payload();
    await expect(
      consumer(
        event({
          payload: { ...incoming, status: 'SUBMITTED', customer: null },
        }),
      ),
    ).resolves.toEqual({ tag: 'ok' });
    expect(observeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: {
          resolution: 'not_provided',
          userId: null,
          externalUserId: null,
        },
        fulfillment: expect.objectContaining({ releaseState: 'unreleased' }),
      }),
    );
  });

  it('fails permanently for unmapped locations and malformed payloads', async () => {
    const orderApplication = orders();
    const unmapped = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => null),
      users: users(),
      orders: orderApplication,
    });
    await expect(unmapped(event())).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'source_location_unmapped' },
    });
    await expect(
      unmapped(event({ payload: { malformed: true } })),
    ).resolves.toMatchObject({
      tag: 'err',
      retryable: false,
      error: { code: 'cents_order_payload_invalid' },
    });
    expect(orderApplication.observeSource).not.toHaveBeenCalled();
  });

  it('retries an order after a transient customer persistence failure', async () => {
    const customerFailure = makeAppError({
      kind: 'DatabaseError',
      code: 'user_source_observation_failed',
      message: 'failed',
      safeMessage: 'failed',
      status: 503,
    });
    const orderApplication = orders();
    const consumer = makeCentsOrderHandler({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      users: users(
        vi.fn(async () => ({ tag: 'err' as const, error: customerFailure })),
      ),
      orders: orderApplication,
    });

    await expect(consumer(event())).resolves.toMatchObject({
      tag: 'err',
      retryable: true,
      error: { code: 'user_source_observation_failed' },
    });
    expect(orderApplication.observeSource).not.toHaveBeenCalled();
  });
});

import { makeAppError } from '@pressly/errors';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveCentsWeightLbs,
  makeCentsOrderConsumer,
} from '../../../src/vendors/cents/cents-order.consumer.ts';

const event = (overrides: Partial<ClaimedWebhookEvent> = {}) => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  payload: {
    externalOrderId: 'order-1',
    externalStoreId: 'store-1',
    status: 'IN_PROGRESS',
    dueAt: '2026-07-10T20:00:00.000Z',
    sourceUpdatedAt: '2026-07-10T13:00:00.000Z',
    bagCount: null,
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
  },
  ...overrides,
});

describe('Cents order consumer adapter', () => {
  it('derives the canonical estimate outside Production', () => {
    expect(
      deriveCentsWeightLbs([
        {
          externalServiceId: 'one',
          name: 'One',
          category: 'LAUNDRY',
          quantity: 1,
          totalPriceCents: 14_800,
          unitPriceCents: 200,
        },
        {
          externalServiceId: 'two',
          name: 'Two',
          category: 'LAUNDRY',
          quantity: 1,
          totalPriceCents: 2_250,
          unitPriceCents: 150,
        },
      ]),
    ).toBe(89);
  });

  it('translates Cents into one source-neutral Production command', async () => {
    const applyOrderDemand = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        orderDemandId: 'demand-1',
        productionOrderId: 'production-1',
        outcome: 'applied' as const,
        replayed: false,
      },
    }));
    const consumer = makeCentsOrderConsumer({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      applyOrderDemand,
    });
    await expect(consumer(event())).resolves.toEqual({ tag: 'ok' });
    expect(applyOrderDemand).toHaveBeenCalledWith({
      demandKey: 'cents:order:order-1',
      displayReference: 'order-1',
      locationId: 'location-1',
      revisionAt: '2026-07-10T13:00:00.000Z',
      revisionHash: 'a'.repeat(64),
      state: 'ready_for_production',
      dueAt: '2026-07-10T20:00:00.000Z',
      estimatedWeightLbs: 74,
      bagCount: null,
      idempotencyKey: 'webhook:00000000-0000-4000-8000-000000000001',
    });
  });

  it('fails permanently for unmapped locations and malformed payloads', async () => {
    const applyOrderDemand = vi.fn();
    const unmapped = makeCentsOrderConsumer({
      resolveSourceLocation: vi.fn(async () => null),
      applyOrderDemand,
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
    expect(applyOrderDemand).not.toHaveBeenCalled();
  });

  it('marks only unexpected Production persistence failures retryable', async () => {
    const consumer = makeCentsOrderConsumer({
      resolveSourceLocation: vi.fn(async () => 'location-1'),
      applyOrderDemand: vi.fn(async () => ({
        tag: 'err' as const,
        error: makeAppError({
          kind: 'DatabaseError',
          code: 'order_demand_application_failed',
          message: 'failed',
          safeMessage: 'failed',
          status: 500,
        }),
      })),
    });
    await expect(consumer(event())).resolves.toMatchObject({
      tag: 'err',
      retryable: true,
    });
  });
});

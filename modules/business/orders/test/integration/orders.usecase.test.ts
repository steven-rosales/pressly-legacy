import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '@pressly/kernel';
import type { ChangeFulfillmentReleaseOperations } from '../../src/features/fulfillment/change-fulfillment-release/change-fulfillment-release.port.ts';
import { makeReleaseFulfillment } from '../../src/features/fulfillment/change-fulfillment-release/change-fulfillment-release.usecase.ts';
import type { ClaimOrderOutboxRepository } from '../../src/features/outbox/claim-order-outbox/claim-order-outbox.port.ts';
import { makeClaimOrderOutbox } from '../../src/features/outbox/claim-order-outbox/claim-order-outbox.usecase.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): UnitOfWork<Operations> => ({
  transaction: (work) => work(operations),
});

const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
const businessId = '00000000-0000-4000-8000-000000000100';
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;

const aggregate = {
  order: {
    id: 'order-1',
    businessId,
    version: 2,
    customerUserId: null,
    customerResolution: 'not_provided' as const,
    displayNumber: 'P-100',
    state: 'open' as const,
    dueAt: new Date('2026-07-22T12:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
  },
  fulfillment: {
    id: 'fulfillment-1',
    businessId,
    orderId: 'order-1',
    version: 2,
    typeCode: 'wash_fold',
    locationId: 'location-1',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: null,
    estimatedWeightSource: null,
    bagCount: null,
  },
  items: [],
};

describe('Orders use cases', () => {
  it('decides a reversed release state before writing', async () => {
    const applyFulfillmentRelease = vi.fn();
    const operations: ChangeFulfillmentReleaseOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      findOrderId: vi.fn().mockResolvedValue('order-1'),
      lockOrder: vi.fn(),
      lockFulfillment: vi.fn(),
      loadFulfillmentOrder: vi.fn().mockResolvedValue({
        ...aggregate,
        fulfillment: { ...aggregate.fulfillment, releaseState: 'withdrawn' },
      }),
      applyFulfillmentRelease,
    };
    const change = makeReleaseFulfillment({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await change({
      businessId,
      idempotencyKey: 'release-1',
      context: directContext,
      reasonCode: 'ready_for_production',
      reasonNote: null,
      fulfillmentId: 'fulfillment-1',
      locationId: 'location-1',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_transition_invalid' },
    });
    expect(applyFulfillmentRelease).not.toHaveBeenCalled();
  });

  it('checks persisted location scope before changing release', async () => {
    const applyFulfillmentRelease = vi.fn();
    const operations: ChangeFulfillmentReleaseOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      findOrderId: vi.fn().mockResolvedValue('order-1'),
      lockOrder: vi.fn(),
      lockFulfillment: vi.fn(),
      loadFulfillmentOrder: vi.fn().mockResolvedValue(aggregate),
      applyFulfillmentRelease,
    };
    const change = makeReleaseFulfillment({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await change({
      businessId,
      idempotencyKey: 'release-2',
      context: directContext,
      reasonCode: 'ready_for_production',
      reasonNote: null,
      fulfillmentId: 'fulfillment-1',
      locationId: 'other-location',
      expectedOrderVersion: 2,
      expectedFulfillmentVersion: 2,
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_not_found' },
    });
    expect(applyFulfillmentRelease).not.toHaveBeenCalled();
  });

  it('bounds outbox claims before persistence', async () => {
    const repo: ClaimOrderOutboxRepository = {
      claim: vi.fn(),
    };
    const claim = makeClaimOrderOutbox({ repo, clock });
    const outcome = await claim({
      workerId: 'worker-1',
      limit: 101,
      leaseMs: 30_000,
    });

    expect(outcome.tag).toBe('err');
    expect(repo.claim).not.toHaveBeenCalled();
  });
});

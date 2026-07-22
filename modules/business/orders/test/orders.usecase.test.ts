import { describe, expect, it, vi } from 'vitest';
import type { ChangeFulfillmentReleaseOperations } from '../src/change-fulfillment-release/change-fulfillment-release.port.ts';
import { makeChangeFulfillmentRelease } from '../src/change-fulfillment-release/change-fulfillment-release.usecase.ts';
import type { ClaimOrderOutboxRepository } from '../src/claim-order-outbox/claim-order-outbox.port.ts';
import { makeClaimOrderOutbox } from '../src/claim-order-outbox/claim-order-outbox.usecase.ts';
import type { OrderTransactionPort } from '../src/order-transaction.port.ts';
import type { ObserveOrderSourceOperations } from '../src/observe-order-source/observe-order-source.port.ts';
import { makeObserveOrderSource } from '../src/observe-order-source/observe-order-source.usecase.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): OrderTransactionPort<Operations> => ({
  transaction: (work) => work(operations),
});

const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
const sourceContext = {
  origin: 'external',
  principal: { kind: 'system', id: 'external-webhook' },
} as const;
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;

const aggregate = {
  order: {
    id: 'order-1',
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
    orderId: 'order-1',
    version: 2,
    typeCode: 'wash_fold',
    locationId: 'location-1',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: null,
    estimatedWeightSource: null,
    bagCount: null,
  },
};

const sourceCommand = {
  context: sourceContext,
  source: 'external',
  externalOrderId: 'order-1',
  customer: {
    resolution: 'not_provided' as const,
    userId: null,
    externalUserId: null,
  },
  displayNumber: 'P-100',
  state: 'open' as const,
  dueAt: new Date('2026-07-22T12:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_000,
  balanceDueCents: 3_000,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'location-1',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: null,
    estimatedWeightSource: null,
    bagCount: null,
  },
  revision: {
    at: clock.now(),
    observedAt: clock.now(),
    hash: 'a'.repeat(64),
    adapterVersion: 'external-v1',
    lifecycleCode: 'OPEN',
    normalizedPayload: {},
  },
};

describe('Orders use cases', () => {
  it('decides divergent equal source revisions before writing', async () => {
    const applySourceOrder = vi.fn();
    const operations: ObserveOrderSourceOperations = {
      lockSource: vi.fn(),
      loadSource: vi.fn().mockResolvedValue({
        ...aggregate,
        sourceLinkId: 'source-link-1',
        revision: { at: clock.now(), hash: 'b'.repeat(64) },
        authorities: new Map(),
      }),
      createSourceOrder: vi.fn(),
      applySourceOrder,
    };
    const observe = makeObserveOrderSource(transactionRepo(operations));

    const outcome = await observe(sourceCommand);

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'order_source_revision_conflict' },
    });
    expect(applySourceOrder).not.toHaveBeenCalled();
  });

  it('decides a reversed release state before writing', async () => {
    const applyFulfillmentRelease = vi.fn();
    const operations: ChangeFulfillmentReleaseOperations = {
      lockCommand: vi.fn(),
      loadCommandReceipt: vi.fn().mockResolvedValue(null),
      saveCommandReceipt: vi.fn(),
      lockFulfillment: vi.fn(),
      loadFulfillmentOrder: vi.fn().mockResolvedValue({
        ...aggregate,
        fulfillment: { ...aggregate.fulfillment, releaseState: 'withdrawn' },
      }),
      applyFulfillmentRelease,
    };
    const change = makeChangeFulfillmentRelease({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await change({
      idempotencyKey: 'release-1',
      context: directContext,
      fulfillmentId: 'fulfillment-1',
      locationId: 'location-1',
      expectedVersion: 2,
      target: 'released',
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
      lockFulfillment: vi.fn(),
      loadFulfillmentOrder: vi.fn().mockResolvedValue(aggregate),
      applyFulfillmentRelease,
    };
    const change = makeChangeFulfillmentRelease({
      repo: transactionRepo(operations),
      clock,
    });

    const outcome = await change({
      idempotencyKey: 'release-2',
      context: directContext,
      fulfillmentId: 'fulfillment-1',
      locationId: 'other-location',
      expectedVersion: 2,
      target: 'released',
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

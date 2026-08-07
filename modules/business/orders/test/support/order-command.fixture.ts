import type { UnitOfWork } from '@pressly/kernel';

export const orderCommandTestClock = {
  now: () => new Date('2026-07-28T16:00:00.000Z'),
};

export const orderCommandTestBusinessId =
  '00000000-0000-4000-8000-000000000100';

export const orderCommandTestContext = {
  origin: 'pressly_processor',
  principal: { kind: 'human', id: 'manager-1' },
} as const;

export const orderCommandTestAggregate = {
  order: {
    id: 'order-1',
    businessId: orderCommandTestBusinessId,
    version: 2,
    customerUserId: null,
    customerResolution: 'not_provided' as const,
    displayNumber: 'P-100',
    state: 'open' as const,
    dueAt: new Date('2026-07-29T12:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
  },
  fulfillment: {
    id: 'fulfillment-1',
    businessId: orderCommandTestBusinessId,
    orderId: 'order-1',
    version: 2,
    typeCode: 'wash_fold',
    locationId: 'east',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'operator_estimate',
    bagCount: null,
  },
};

export const transactionRepository = <Operations>(
  operations: Operations,
): UnitOfWork<Operations> => ({
  transaction: (work) => work(operations),
});

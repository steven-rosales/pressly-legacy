import type {
  IncomingOrderProposal,
  IncomingOrderSourceTombstone,
} from '../../src/foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';

export const orderProposalContext = {
  origin: 'pressly_processor',
  principal: { kind: 'human', id: 'manager-1' },
} as const;

export const externalOrdersAdapterContext = {
  origin: 'external_orders_adapter',
  principal: { kind: 'system', id: 'external-orders' },
} as const;

export const proposalNow = new Date('2026-07-28T18:00:00.000Z');

export const orderProposalClock = { now: () => proposalNow };

export const makeIncomingOrderProposal = (
  overrides: Partial<IncomingOrderProposal> = {},
): IncomingOrderProposal => ({
  id: '10000000-0000-4000-8000-000000000001',
  source: 'external-orders',
  externalOrderId: 'external-1',
  locationId: 'east',
  proposalKind: 'submitted_order',
  sourceRevisionAt: new Date('2026-07-28T17:59:00.000Z'),
  sourceRevisionHash: 'a'.repeat(64),
  adapterVersion: 'external-orders-v1',
  sourceNormalizedPayload: { order: { id: 'external-1' } },
  snapshot: {
    customer: null,
    displayNumber: 'P-1001',
    dueAt: new Date('2026-07-28T22:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
    items: [],
    fulfillment: {
      typeCode: 'wash_fold',
      locationId: 'east',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
    },
  },
  observedAt: proposalNow,
  state: 'pending',
  version: 1,
  resolution: null,
  sourceClosure: null,
  ...overrides,
});

export const makeIncomingOrderSourceTombstone = (
  overrides: Partial<IncomingOrderSourceTombstone> = {},
): IncomingOrderSourceTombstone => {
  const proposal = makeIncomingOrderProposal();
  return {
    source: proposal.source,
    externalOrderId: proposal.externalOrderId,
    proposalId: null,
    terminalCode: 'completed',
    sourceRevisionAt: new Date('2026-07-28T18:05:00.000Z'),
    sourceRevisionHash: 'b'.repeat(64),
    observedAt: new Date('2026-07-28T18:05:01.000Z'),
    ...overrides,
  };
};

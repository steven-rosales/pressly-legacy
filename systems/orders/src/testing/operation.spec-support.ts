export const ordersUnitProofContext = Object.freeze({
  origin: 'pressly_dashboard',
  principal: Object.freeze({ kind: 'human' as const, id: 'identity-1' }),
});

export const ordersUnitProofOrderId = '79000000-0000-4000-8000-000000000001';
export const ordersUnitProofFulfillmentId =
  '79000000-0000-4000-8000-000000000002';
export const ordersUnitProofProposalId = '79000000-0000-4000-8000-000000000003';

export const ordersUnitProofMutationResult = Object.freeze({
  orderId: ordersUnitProofOrderId,
  fulfillmentId: ordersUnitProofFulfillmentId,
  version: 2,
  replayed: false,
});

export const ordersUnitProofProposalDecisionResult = Object.freeze({
  proposalId: ordersUnitProofProposalId,
  state: 'accepted' as const,
  version: 2,
  orderId: ordersUnitProofOrderId,
  fulfillmentId: ordersUnitProofFulfillmentId,
  replayed: false,
});

const ordersUnitProofAt = new Date('2026-08-23T16:00:00.000Z');

export const ordersUnitProofCanonicalOrderDetail = Object.freeze({
  orderId: ordersUnitProofOrderId,
  businessId: 'business-1',
  orderVersion: 1,
  fulfillmentId: ordersUnitProofFulfillmentId,
  fulfillmentVersion: 1,
  displayNumber: 'P-790',
  state: 'open' as const,
  dueAt: new Date('2026-08-25T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_600,
  balanceDueCents: 3_600,
  customer: Object.freeze({
    resolution: 'not_provided' as const,
    userId: null,
    displayName: null,
    phone: null,
    email: null,
  }),
  fulfillment: Object.freeze({
    typeCode: 'wash_fold',
    locationId: 'east',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
  }),
  createdAt: ordersUnitProofAt,
  updatedAt: ordersUnitProofAt,
  items: Object.freeze([]),
});

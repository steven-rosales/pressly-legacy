import { describe, expect, it } from 'vitest';
import {
  acceptIncomingOrderProposalRequestSchema,
  completeOrderRequestSchema,
  correctOrderRequestSchema,
  createOrderRequestSchema,
  incomingOrderProposalDecisionResultSchema,
  incomingOrderProposalListQuerySchema,
  incomingOrderProposalListSchema,
  incomingOrderProposalParamsSchema,
  incomingOrderProposalStateSchema,
  rejectIncomingOrderProposalRequestSchema,
  releaseFulfillmentRequestSchema,
  restoreIncomingOrderProposalRequestSchema,
  restoreIncomingOrderProposalResultSchema,
} from '../src/orders/orders.contracts.ts';

const directOrder = {
  idempotencyKey: 'create-order-001',
  reasonCode: 'new_customer_order',
  reasonNote: null,
  customer: { resolution: 'not_provided', userId: null },
  displayNumber: 'P-1001',
  dueAt: '2026-07-28T20:00:00.000Z',
  currency: 'USD',
  totalAmountCents: 3_000,
  balanceDueCents: 3_000,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'east',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'operator_estimate',
  },
} as const;

describe('canonical Order command contracts', () => {
  it('keeps submitted candidates location-scoped and separates source from ingestion time', () => {
    expect(
      incomingOrderProposalParamsSchema.safeParse({
        locationId: 'east',
        proposalId: '10000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      incomingOrderProposalListSchema.safeParse({
        items: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            version: 1,
            state: 'pending',
            source: 'external-orders',
            externalOrderId: 'order-1',
            locationId: 'east',
            displayNumber: 'P-1001',
            customer: {
              displayName: 'Ada Lovelace',
              phone: '+12015550101',
              email: null,
            },
            dueAt: '2026-07-28T20:00:00.000Z',
            estimatedWeightLbs: 18,
            sourceReportedAt: '2026-07-28T18:00:00.000Z',
            reportedAt: '2026-07-28T18:00:01.000Z',
            sourceClosure: null,
            availableActions: ['accept', 'reject'],
            acceptBlockedReason: null,
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it('exposes the complete candidate graph and explicit source-closed review view', () => {
    expect(incomingOrderProposalStateSchema.options).toEqual([
      'pending',
      'source_closed',
      'restored_pending',
      'accepted',
      'rejected',
    ]);
    expect(incomingOrderProposalListQuerySchema.parse({})).toEqual({
      limit: 50,
      view: 'needs_review',
    });
    expect(
      incomingOrderProposalListQuerySchema.parse({
        limit: '25',
        view: 'source_closed',
      }),
    ).toEqual({
      limit: 25,
      view: 'source_closed',
    });
    expect(
      incomingOrderProposalListSchema.safeParse({
        items: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            version: 2,
            state: 'source_closed',
            source: 'external-orders',
            externalOrderId: 'order-1',
            locationId: 'east',
            displayNumber: 'P-1001',
            customer: null,
            dueAt: '2026-07-28T20:00:00.000Z',
            estimatedWeightLbs: 18,
            sourceReportedAt: '2026-07-28T18:00:00.000Z',
            reportedAt: '2026-07-28T18:00:01.000Z',
            sourceClosure: {
              kind: 'completed',
              observedAt: '2026-07-28T18:05:00.000Z',
            },
            availableActions: ['restore'],
            acceptBlockedReason: null,
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
  });

  it('uses explicit terminal proposal decisions with coherent effects', () => {
    expect(
      acceptIncomingOrderProposalRequestSchema.safeParse({
        expectedVersion: 1,
        idempotencyKey: 'accept-proposal-001',
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }).success,
    ).toBe(true);
    expect(
      rejectIncomingOrderProposalRequestSchema.safeParse({
        expectedVersion: 1,
        idempotencyKey: 'reject-proposal-001',
        reasonCode: 'already_handled',
        reasonNote: null,
      }).success,
    ).toBe(true);
    expect(
      incomingOrderProposalDecisionResultSchema.safeParse({
        proposalId: '10000000-0000-4000-8000-000000000001',
        state: 'accepted',
        version: 2,
        orderId: null,
        fulfillmentId: null,
        replayed: false,
      }).success,
    ).toBe(false);
  });

  it('restores only source-closed candidates through a dedicated command', () => {
    expect(
      restoreIncomingOrderProposalRequestSchema.safeParse({
        expectedVersion: 2,
        idempotencyKey: 'restore-proposal-001',
        reasonCode: 'source_closure_overridden',
        reasonNote: 'Manager verified that the physical work is still active.',
      }).success,
    ).toBe(true);
    expect(
      restoreIncomingOrderProposalResultSchema.safeParse({
        proposalId: '10000000-0000-4000-8000-000000000001',
        state: 'restored_pending',
        version: 3,
        replayed: false,
      }).success,
    ).toBe(true);
  });

  it('accepts descriptive direct creation without lifecycle or physical truth', () => {
    expect(createOrderRequestSchema.safeParse(directOrder).success).toBe(true);
  });

  it.each([
    { ...directOrder, state: 'completed' },
    {
      ...directOrder,
      fulfillment: {
        ...directOrder.fulfillment,
        releaseState: 'released',
      },
    },
    {
      ...directOrder,
      fulfillment: { ...directOrder.fulfillment, bagCount: 2 },
    },
  ])('rejects canonical or physical truth on direct creation', (input) => {
    expect(createOrderRequestSchema.safeParse(input).success).toBe(false);
  });

  it('keeps correction descriptive and lifecycle commands event-shaped', () => {
    expect(
      correctOrderRequestSchema.safeParse({
        idempotencyKey: 'correct-order-001',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'customer_correction',
        reasonNote: null,
        changes: { state: 'completed' },
      }).success,
    ).toBe(false);
    expect(
      completeOrderRequestSchema.safeParse({
        idempotencyKey: 'complete-order-001',
        expectedVersion: 1,
        reasonCode: 'service_completed',
        reasonNote: null,
        target: 'canceled',
      }).success,
    ).toBe(false);
  });

  it('permits canonical correction of every external descriptive claim', () => {
    expect(
      correctOrderRequestSchema.safeParse({
        idempotencyKey: 'correct-order-claims',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'source_discrepancy',
        reasonNote: 'Manager verified the physical order record.',
        changes: {
          items: [
            {
              lineKey: 'wash-fold',
              itemType: 'service',
              code: 'WF',
              description: 'Wash and fold',
              quantity: 1,
              unit: 'order',
              unitPriceCents: 3_000,
              totalAmountCents: 3_000,
              sourceMetadata: {},
            },
          ],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'east',
            estimatedWeight: {
              lbs: 18,
              source: 'manager_estimate',
            },
          },
        },
      }).success,
    ).toBe(true);
  });

  it('requires both aggregate versions and has no caller-selected release target', () => {
    expect(
      releaseFulfillmentRequestSchema.safeParse({
        idempotencyKey: 'release-order-001',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'ready_for_production',
        reasonNote: null,
      }).success,
    ).toBe(true);
    expect(
      releaseFulfillmentRequestSchema.safeParse({
        idempotencyKey: 'release-order-001',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        reasonCode: 'ready_for_production',
        reasonNote: null,
        target: 'withdrawn',
      }).success,
    ).toBe(false);
  });
});

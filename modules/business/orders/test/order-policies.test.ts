import { describe, expect, it } from 'vitest';
import {
  allowedIncomingOrderProposalEvents,
  decideIncomingOrderProposal,
  incomingOrderProposalGraph,
} from '../src/incoming-order-proposal.policy.ts';
import { isOrderInputValid } from '../src/order-input.policy.ts';
import {
  mayTransitionFulfillment,
  mayTransitionOrder,
} from '../src/order-lifecycle.policy.ts';
import { fulfillmentDemandEvent } from '../src/order-outbox.policy.ts';
import type { OrderInput } from '../src/orders.port.ts';

const input = (): OrderInput => ({
  customer: { resolution: 'not_provided', userId: null, externalUserId: null },
  displayNumber: 'P-100',
  state: 'open',
  dueAt: new Date('2026-07-22T12:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_000,
  balanceDueCents: 3_000,
  items: [
    {
      lineKey: 'wash-fold',
      itemType: 'service',
      code: 'wash-fold',
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
    locationId: 'location-1',
    releaseState: 'unreleased',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    bagCount: null,
  },
});

describe('Orders policies', () => {
  it('models source closure and operator restoration in one candidate graph', () => {
    expect(incomingOrderProposalGraph).toEqual([
      { from: 'pending', event: 'accept', to: 'accepted' },
      { from: 'pending', event: 'reject', to: 'rejected' },
      {
        from: 'pending',
        event: 'source_close',
        to: 'source_closed',
      },
      {
        from: 'source_closed',
        event: 'restore',
        to: 'restored_pending',
      },
      {
        from: 'restored_pending',
        event: 'accept',
        to: 'accepted',
      },
      {
        from: 'restored_pending',
        event: 'reject',
        to: 'rejected',
      },
    ]);
    expect(allowedIncomingOrderProposalEvents('pending')).toEqual([
      'accept',
      'reject',
      'source_close',
    ]);
    expect(allowedIncomingOrderProposalEvents('source_closed')).toEqual([
      'restore',
    ]);
    expect(allowedIncomingOrderProposalEvents('restored_pending')).toEqual([
      'accept',
      'reject',
    ]);
    expect(allowedIncomingOrderProposalEvents('accepted')).toEqual([]);
    expect(allowedIncomingOrderProposalEvents('rejected')).toEqual([]);

    expect(
      decideIncomingOrderProposal('pending', 'source_close'),
    ).toMatchObject({
      kind: 'allowed',
      to: 'source_closed',
    });
    expect(
      decideIncomingOrderProposal('source_closed', 'restore'),
    ).toMatchObject({
      kind: 'allowed',
      to: 'restored_pending',
    });
    expect(
      decideIncomingOrderProposal('restored_pending', 'source_close'),
    ).toMatchObject({
      kind: 'denied',
      allowedEvents: ['accept', 'reject'],
    });

    for (const terminal of ['accepted', 'rejected'] as const)
      for (const event of [
        'accept',
        'reject',
        'source_close',
        'restore',
      ] as const)
        expect(decideIncomingOrderProposal(terminal, event)).toMatchObject({
          kind: 'denied',
          allowedEvents: [],
        });
  });

  it('keeps commercial and fulfillment terminal states monotonic', () => {
    expect(mayTransitionOrder('open', 'completed')).toBe(true);
    expect(mayTransitionOrder('completed', 'open')).toBe(false);
    expect(mayTransitionFulfillment('unreleased', 'released')).toBe(true);
    expect(mayTransitionFulfillment('released', 'withdrawn')).toBe(true);
    expect(mayTransitionFulfillment('withdrawn', 'released')).toBe(false);
  });

  it('rejects ambiguous weight provenance and duplicate line identities', () => {
    expect(isOrderInputValid(input())).toBe(true);
    expect(
      isOrderInputValid({
        ...input(),
        fulfillment: { ...input().fulfillment, estimatedWeightSource: null },
      }),
    ).toBe(false);
    expect(
      isOrderInputValid({
        ...input(),
        items: [...input().items, input().items[0]!],
      }),
    ).toBe(false);
  });

  it.each([
    [
      'non-finite item quantity',
      () => ({
        ...input(),
        items: [{ ...input().items[0]!, quantity: Number.NaN }],
      }),
    ],
    [
      'fractional item cents',
      () => ({
        ...input(),
        items: [{ ...input().items[0]!, unitPriceCents: 1.5 }],
      }),
    ],
    [
      'fractional item line total',
      () => ({
        ...input(),
        items: [{ ...input().items[0]!, totalAmountCents: 3_000.5 }],
      }),
    ],
    [
      'fractional order cents',
      () => ({ ...input(), totalAmountCents: 3_000.5 }),
    ],
    [
      'fractional balance cents',
      () => ({ ...input(), balanceDueCents: 3_000.5 }),
    ],
    [
      'non-finite estimated weight',
      () => ({
        ...input(),
        fulfillment: {
          ...input().fulfillment,
          estimatedWeightLbs: Number.POSITIVE_INFINITY,
        },
      }),
    ],
    [
      'fractional physical bag count',
      () => ({
        ...input(),
        fulfillment: { ...input().fulfillment, bagCount: 1.5 },
      }),
    ],
  ] satisfies readonly (readonly [string, () => OrderInput])[])(
    'rejects %s at the canonical domain boundary',
    (_name, invalidInput) => {
      expect(isOrderInputValid(invalidInput())).toBe(false);
    },
  );

  it('emits source-neutral fulfillment demand', () => {
    const event = fulfillmentDemandEvent({
      fulfillmentId: '00000000-0000-4000-8000-000000000001',
      displayNumber: 'P-100',
      locationId: 'location-1',
      typeCode: 'wash_fold',
      admissionState: 'released',
      commercialState: 'open',
      dueAt: new Date('2026-07-22T12:00:00.000Z'),
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
      bagCount: 1,
      version: 2,
      observedAt: new Date('2026-07-21T12:00:00.000Z'),
    });

    expect(event).toMatchObject({
      schemaVersion: 1,
      eventType: 'fulfillment_demand_changed',
      admissionState: 'released',
      observedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(JSON.stringify(event).toLowerCase()).not.toContain('cents');
  });
});

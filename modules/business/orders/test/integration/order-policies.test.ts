import { describe, expect, it } from 'vitest';
import {
  allowedIncomingOrderProposalEvents,
  decideIncomingOrderProposal,
  incomingOrderProposalGraph,
} from '../../src/foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
import type {
  IncomingOrderProposalEvent,
  IncomingOrderProposalState,
} from '../../src/foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
import {
  decideFulfillmentRelease,
  mayTransitionFulfillment,
} from '../../src/features/fulfillment/change-fulfillment-release/change-fulfillment-release.policy.ts';
import {
  decideOrderLifecycle,
  mayTransitionOrder,
} from '../../src/features/lifecycle/change-order-lifecycle/change-order-lifecycle.policy.ts';
import { isOrderInputValid } from '../../src/foundations/language/order/order-input.policy.ts';
import type {
  FulfillmentReleaseState,
  OrderInput,
  OrderState,
} from '../../src/foundations/language/order/order.model.ts';
import { fulfillmentDemandEvent } from '../../src/foundations/language/order-outbox/order-outbox.policy.ts';

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

  it('defines every commercial order state and event combination', () => {
    const states: readonly OrderState[] = ['open', 'completed', 'canceled'];
    const events = ['complete', 'cancel'] as const;
    const expected = new Map([
      ['open:complete', 'completed'],
      ['open:cancel', 'canceled'],
    ]);

    for (const state of states)
      for (const type of events) {
        const decision = decideOrderLifecycle(state, { type });
        const target = expected.get(`${state}:${type}`);
        if (target === undefined) {
          expect(decision).toEqual({
            kind: 'denied',
            from: state,
            event: type,
            allowedEvents: [],
          });
        } else {
          expect(decision).toEqual({
            kind: 'allowed',
            from: state,
            to: target,
            event: type,
          });
        }
      }
  });

  it('defines every fulfillment release state and event combination', () => {
    const states: readonly FulfillmentReleaseState[] = [
      'unreleased',
      'released',
      'withdrawn',
    ];
    const events = ['release', 'withdraw'] as const;
    const expected = new Map([
      ['unreleased:release', 'released'],
      ['unreleased:withdraw', 'withdrawn'],
      ['released:withdraw', 'withdrawn'],
    ]);
    const allowedEvents = new Map<FulfillmentReleaseState, readonly string[]>([
      ['unreleased', ['release', 'withdraw']],
      ['released', ['withdraw']],
      ['withdrawn', []],
    ]);

    for (const state of states)
      for (const type of events) {
        const decision = decideFulfillmentRelease(state, { type });
        const target = expected.get(`${state}:${type}`);
        if (target === undefined) {
          expect(decision).toEqual({
            kind: 'denied',
            from: state,
            event: type,
            allowedEvents: allowedEvents.get(state),
          });
        } else {
          expect(decision).toEqual({
            kind: 'allowed',
            from: state,
            to: target,
            event: type,
          });
        }
      }
  });

  it('defines every incoming proposal state and event combination', () => {
    const states: readonly IncomingOrderProposalState[] = [
      'pending',
      'source_closed',
      'restored_pending',
      'accepted',
      'rejected',
    ];
    const events: readonly IncomingOrderProposalEvent[] = [
      'accept',
      'reject',
      'source_close',
      'restore',
    ];
    const expected = new Map([
      ['pending:accept', 'accepted'],
      ['pending:reject', 'rejected'],
      ['pending:source_close', 'source_closed'],
      ['source_closed:restore', 'restored_pending'],
      ['restored_pending:accept', 'accepted'],
      ['restored_pending:reject', 'rejected'],
    ]);

    for (const state of states)
      for (const event of events) {
        const decision = decideIncomingOrderProposal(state, event);
        const target = expected.get(`${state}:${event}`);
        if (target === undefined) {
          expect(decision).toEqual({
            kind: 'denied',
            from: state,
            event,
            allowedEvents: allowedIncomingOrderProposalEvents(state),
          });
        } else {
          expect(decision).toEqual({
            kind: 'allowed',
            from: state,
            to: target,
            event,
          });
        }
      }
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
      observedAt: new Date('2026-07-21T12:00:00.000Z'),
    });
    expect(JSON.stringify(event).toLowerCase()).not.toContain('cents');
  });
});

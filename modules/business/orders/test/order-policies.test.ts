import { describe, expect, it } from 'vitest';
import { isOrderInputValid } from '../src/order-input.policy.ts';
import {
  mayTransitionFulfillment,
  mayTransitionOrder,
} from '../src/order-lifecycle.policy.ts';
import { fulfillmentDemandEvent } from '../src/order-outbox.policy.ts';
import { decideOrderSourceRevision } from '../src/order-source-ordering.policy.ts';
import { decideOrderSourceUpdate } from '../src/observe-order-source/observe-order-source.policy.ts';
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
  it('keeps commercial and fulfillment terminal states monotonic', () => {
    expect(mayTransitionOrder('open', 'completed')).toBe(true);
    expect(mayTransitionOrder('completed', 'open')).toBe(false);
    expect(mayTransitionFulfillment('unreleased', 'released')).toBe(true);
    expect(mayTransitionFulfillment('released', 'withdrawn')).toBe(true);
    expect(mayTransitionFulfillment('withdrawn', 'released')).toBe(false);
  });

  it('rejects ambiguous weight provenance and duplicate generic line identities', () => {
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

  it('distinguishes newer, replayed, stale, and divergent source observations', () => {
    const at = new Date('2026-07-21T12:00:00.000Z');
    expect(decideOrderSourceRevision(null, { at, hash: 'a' })).toEqual({
      tag: 'ok',
      value: 'apply',
    });
    expect(
      decideOrderSourceRevision({ at, hash: 'a' }, { at, hash: 'a' }),
    ).toEqual({ tag: 'ok', value: 'replay' });
    expect(
      decideOrderSourceRevision(
        { at, hash: 'a' },
        { at: new Date(at.getTime() - 1), hash: 'b' },
      ),
    ).toEqual({ tag: 'ok', value: 'stale' });
    expect(
      decideOrderSourceRevision({ at, hash: 'a' }, { at, hash: 'b' }),
    ).toEqual({ tag: 'err', error: 'conflict' });
  });

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

    expect(event.admissionState).toBe('released');
    expect(event).toMatchObject({
      schemaVersion: 1,
      eventType: 'fulfillment_demand_changed',
    });
    expect(event.observedAt).toBe('2026-07-21T12:00:00.000Z');
    expect(JSON.stringify(event).toLowerCase()).not.toContain('cents');
  });

  it('preserves Pressly-owned lifecycle while applying source-owned demand', () => {
    const currentAt = new Date('2026-07-21T12:00:00.000Z');
    const decision = decideOrderSourceUpdate({
      current: {
        sourceLinkId: 'source-link-1',
        order: {
          id: 'order-1',
          version: 2,
          customerUserId: null,
          customerResolution: 'not_provided',
          displayNumber: 'P-100',
          state: 'open',
          dueAt: new Date('2026-07-22T12:00:00.000Z'),
          currency: 'USD',
          totalAmountCents: 3_000,
          balanceDueCents: 3_000,
        },
        fulfillment: {
          id: 'fulfillment-1',
          orderId: 'order-1',
          version: 1,
          typeCode: 'wash_fold',
          locationId: 'location-1',
          releaseState: 'unreleased',
          estimatedWeightLbs: 18,
          estimatedWeightSource: 'source_estimate',
          bagCount: null,
        },
        revision: { at: currentAt, hash: 'a' },
        authorities: new Map([
          ['state', { authority: 'pressly', source: null }],
          ['dueAt', { authority: 'source', source: 'external' }],
        ]),
      },
      observation: {
        ...input(),
        context: {
          origin: 'external',
          principal: { kind: 'system', id: 'external-webhook' },
        },
        source: 'external',
        externalOrderId: 'external-1',
        state: 'completed',
        dueAt: new Date('2026-07-23T12:00:00.000Z'),
        revision: {
          at: new Date(currentAt.getTime() + 1),
          hash: 'b',
          adapterVersion: 'external-v1',
          lifecycleCode: 'OPEN',
          observedAt: currentAt,
          normalizedPayload: {},
        },
      },
    });

    expect(decision).toMatchObject({
      tag: 'ok',
      value: {
        kind: 'apply',
        nextOrder: {
          state: 'open',
          dueAt: new Date('2026-07-23T12:00:00.000Z'),
        },
        nextOrderVersion: 3,
      },
    });
  });
});

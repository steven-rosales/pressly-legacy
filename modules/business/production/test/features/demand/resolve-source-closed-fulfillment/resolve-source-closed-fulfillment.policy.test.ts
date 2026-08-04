import { describe, expect, it } from 'vitest';
import type { ProductionOrderResolutionCandidate } from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.model.ts';
import { classifySourceClosedFulfillment } from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.policy.ts';

const candidate = (
  overrides: Partial<ProductionOrderResolutionCandidate> = {},
): ProductionOrderResolutionCandidate => ({
  orderId: 'order-1',
  locationId: 'location-1',
  productionVersion: 3,
  resolutionState: 'open',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  ...overrides,
});

describe('source-closed fulfillment preflight', () => {
  it('admits only open, unreleased, unresolved canonical work', () => {
    expect(classifySourceClosedFulfillment(candidate())).toEqual({
      decision: 'ready',
      candidate: candidate(),
    });
  });

  it('distinguishes missing and already-resolved projections', () => {
    expect(classifySourceClosedFulfillment(null)).toEqual({
      decision: 'not_found',
    });
    expect(
      classifySourceClosedFulfillment(
        candidate({ resolutionState: 'resolved_without_production' }),
      ),
    ).toMatchObject({ decision: 'already_resolved' });
  });

  it.each([
    {
      facts: { sourceCommercialState: 'completed' as const },
      reason: 'canonical_order_not_open',
    },
    {
      facts: { sourceAdmissionState: 'released' as const },
      reason: 'fulfillment_not_unreleased',
    },
    {
      facts: { resolutionState: 'unexpected' },
      reason: 'resolution_state_invalid',
    },
  ])('requires review for canonical fact drift: %o', ({ facts, reason }) => {
    expect(classifySourceClosedFulfillment(candidate(facts))).toMatchObject({
      decision: 'review_required',
      reason,
    });
  });
});

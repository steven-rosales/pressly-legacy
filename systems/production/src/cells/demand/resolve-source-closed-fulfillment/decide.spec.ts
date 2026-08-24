import { proveOperation } from '@pressly/testkit/operation-proof';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import {
  decideSourceClosedFulfillment,
  reviewReasonForResolutionFailure,
} from './decide.ts';
import type { ProductionOrderResolutionCandidate } from './types.ts';

const candidate = (
  overrides: Partial<ProductionOrderResolutionCandidate> = {},
): ProductionOrderResolutionCandidate => ({
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  locationId: 'location-1',
  productionVersion: 3,
  resolutionState: 'open',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  ...overrides,
});

describe('decide source-closed fulfillment', () => {
  proveOperation({
    operationId: 'production.resolve-source-closed-fulfillment.v1',
    declaration: resolveSourceClosedFulfillmentCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'delegates only open, unreleased, unresolved canonical work',
        proves: ['decision'],
        run: () => {
          expect(decideSourceClosedFulfillment(candidate())).toEqual({
            kind: 'resolve',
            candidate: candidate(),
          });
        },
      },
    ],
  });

  it('distinguishes missing and already-resolved work first', () => {
    expect(decideSourceClosedFulfillment(null)).toEqual({
      kind: 'not_found',
    });
    const historical = candidate({
      resolutionState: 'resolved_without_production',
      sourceAdmissionState: 'released',
      sourceCommercialState: 'completed',
    });
    expect(decideSourceClosedFulfillment(historical)).toEqual({
      kind: 'already_resolved',
      candidate: historical,
    });
  });

  it.each([
    {
      name: 'invalid resolution state',
      facts: { resolutionState: 'unexpected' },
      reason: 'resolution_state_invalid',
    },
    {
      name: 'completed canonical order',
      facts: { sourceCommercialState: 'completed' as const },
      reason: 'canonical_order_not_open',
    },
    {
      name: 'canceled canonical order',
      facts: { sourceCommercialState: 'canceled' as const },
      reason: 'canonical_order_not_open',
    },
    {
      name: 'released fulfillment',
      facts: { sourceAdmissionState: 'released' as const },
      reason: 'fulfillment_not_unreleased',
    },
    {
      name: 'withdrawn fulfillment',
      facts: { sourceAdmissionState: 'withdrawn' as const },
      reason: 'fulfillment_not_unreleased',
    },
  ])('requires review for $name', ({ facts, reason }) => {
    expect(decideSourceClosedFulfillment(candidate(facts))).toMatchObject({
      kind: 'review_required',
      reason,
    });
  });

  it.each([
    {
      code: 'production_order_resolution_review_required',
      reason: 'operational_review_required',
    },
    {
      code: 'production_order_resolution_blocked',
      reason: 'operational_participation',
    },
    {
      code: 'production_order_version_conflict',
      reason: 'concurrent_change',
    },
    {
      code: 'production_order_not_found',
      reason: 'concurrent_change',
    },
  ])('maps delegated $code to $reason', ({ code, reason }) => {
    expect(reviewReasonForResolutionFailure(code)).toBe(reason);
  });
});

import { describe, expect, it } from 'vitest';
import {
  toChangeProductionOrderResolutionCommand,
  toChangeProductionOrderResolutionResult,
} from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.contract.mapper.ts';

const scope = {
  locationId: 'location-1',
  orderId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
} as const;

describe('change Production order resolution mapper', () => {
  it('combines a parsed resolve request with authenticated route scope', () => {
    expect(
      toChangeProductionOrderResolutionCommand(
        {
          action: 'resolve_without_production',
          reason: 'processor_not_in_use',
          note: null,
          confirmReviewedFacts: false,
          expectedVersion: 4,
          idempotencyKey: 'resolve-order-123',
        },
        scope,
      ),
    ).toEqual({
      ...scope,
      action: 'resolve_without_production',
      reason: 'processor_not_in_use',
      note: null,
      confirmReviewedFacts: false,
      expectedVersion: 4,
      idempotencyKey: 'resolve-order-123',
    });
  });

  it('keeps restore as a distinct application command', () => {
    expect(
      toChangeProductionOrderResolutionCommand(
        {
          action: 'restore',
          reason: 'manager_correction',
          note: 'The work belongs on the floor.',
          expectedVersion: 5,
          idempotencyKey: 'restore-order-123',
        },
        scope,
      ),
    ).toEqual({
      ...scope,
      action: 'restore',
      reason: 'manager_correction',
      note: 'The work belongs on the floor.',
      expectedVersion: 5,
      idempotencyKey: 'restore-order-123',
    });
  });

  it('maps the application outcome to the serialized response', () => {
    const result = {
      locationId: scope.locationId,
      orderId: scope.orderId,
      action: 'resolve_without_production' as const,
      resolutionState: 'resolved_without_production' as const,
      transitionedAt: '2026-07-26T23:00:00.000Z',
      version: 5,
      replayed: false,
    };

    expect(toChangeProductionOrderResolutionResult(result)).toEqual(result);
  });
});

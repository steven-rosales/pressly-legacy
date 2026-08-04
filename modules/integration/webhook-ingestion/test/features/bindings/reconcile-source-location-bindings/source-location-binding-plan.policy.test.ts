import { describe, expect, it } from 'vitest';
import { planSourceLocationBindings } from '../../../../src/features/bindings/reconcile-source-location-bindings/source-location-binding-plan.policy.ts';

const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

describe('source-location binding plan', () => {
  it('derives immutable additions without performing effects', () => {
    const plan = planSourceLocationBindings({
      existing: [],
      desired: [binding],
    });

    expect(plan).toEqual({
      status: 'converged',
      operations: [
        {
          source: binding.source,
          externalLocationId: binding.externalLocationId,
          locationId: binding.locationId,
          outcome: 'created',
        },
      ],
      rejections: [],
      additions: [binding],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.additions)).toBe(true);
  });

  it('rejects destructive removal from a represented source/location pair', () => {
    const plan = planSourceLocationBindings({
      existing: [binding, { ...binding, externalLocationId: 'store-2' }],
      desired: [binding],
    });

    expect(plan.status).toBe('rejected');
    expect(plan.rejections).toContainEqual(
      expect.objectContaining({
        externalLocationId: 'store-2',
        code: 'binding_removal',
      }),
    );
  });
});

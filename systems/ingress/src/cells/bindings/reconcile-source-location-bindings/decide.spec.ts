import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { reconcileSourceLocationBindingsCellDeclaration } from './cell.ts';
import { planSourceLocationBindings } from './decide.ts';

const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

describe('source-location binding plan', () => {
  proveOperation({
    operationId: 'ingress.reconcile-source-location-bindings.v1',
    declaration: reconcileSourceLocationBindingsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'plans immutable additions and exact no-ops',
        proves: ['decision'],
        run: () => {
          const addition = planSourceLocationBindings({
            existing: [],
            desired: [binding],
          });
          const noop = planSourceLocationBindings({
            existing: [binding],
            desired: [binding],
          });

          expect(addition).toEqual({
            status: 'converged',
            operations: [
              {
                source: 'cents',
                externalLocationId: 'store-1',
                locationId: 'location-1',
                outcome: 'created',
              },
            ],
            rejections: [],
            additions: [binding],
          });
          expect(noop.operations).toEqual([
            expect.objectContaining({ outcome: 'noop' }),
          ]);
          expect(Object.isFrozen(addition)).toBe(true);
          expect(Object.isFrozen(addition.additions)).toBe(true);
        },
      },
    ],
  });

  it.each([
    {
      name: 'reassignment',
      existing: [binding],
      desired: [{ ...binding, locationId: 'location-2' }],
      code: 'binding_location_change',
    },
    {
      name: 'deactivation',
      existing: [binding],
      desired: [{ ...binding, isActive: false }],
      code: 'binding_deactivation',
    },
    {
      name: 'removal',
      existing: [binding, { ...binding, externalLocationId: 'store-2' }],
      desired: [binding],
      code: 'binding_removal',
    },
  ])('rejects destructive $name', ({ existing, desired, code }) => {
    expect(
      planSourceLocationBindings({ existing, desired }).rejections,
    ).toContainEqual(expect.objectContaining({ code }));
  });
});

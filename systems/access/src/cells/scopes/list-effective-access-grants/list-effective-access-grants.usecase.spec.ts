import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listEffectiveAccessGrantsCellDeclaration } from './cell.ts';
import { makeListEffectiveAccessGrants } from './list-effective-access-grants.usecase.ts';

proveOperation({
  operationId: 'access.list-effective-access-grants.v1',
  declaration: listEffectiveAccessGrantsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'uses the Access clock and preserves store ordering',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          listEffectiveAccessGrantsCellDeclaration.contract.input.decode(
            'identity-1',
          ).kind,
        ).toBe('valid');
        const now = new Date('2026-08-22T16:00:00.000Z');
        const listEffectiveGrants = vi.fn(async () => [
          {
            businessId: 'business-b',
            businessName: 'Business B',
            role: 'manager' as const,
            scopeKind: 'location' as const,
            scopeId: 'location-b',
          },
          {
            businessId: 'business-a',
            businessName: 'Business A',
            role: 'owner' as const,
            scopeKind: 'business' as const,
            scopeId: 'business-a',
          },
        ]);
        const list = makeListEffectiveAccessGrants({
          store: { listEffectiveGrants },
          clock: { now: () => new Date(now) },
        });

        await expect(list('identity-1')).resolves.toEqual({
          grants: [
            {
              businessId: 'business-b',
              businessName: 'Business B',
              role: 'manager',
              scopeKind: 'location',
              scopeId: 'location-b',
            },
            {
              businessId: 'business-a',
              businessName: 'Business A',
              role: 'owner',
              scopeKind: 'business',
              scopeId: 'business-a',
            },
          ],
        });
        expect(listEffectiveGrants).toHaveBeenCalledWith({
          identityId: 'identity-1',
          now,
        });
      },
    },
  ],
});

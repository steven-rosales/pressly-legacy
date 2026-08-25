import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { resolveLocationAncestryCellDeclaration } from './cell.ts';
import { makeResolveLocationAncestry } from './resolve-location-ancestry.usecase.ts';

proveOperation({
  operationId: 'access.resolve-location-ancestry.v1',
  declaration: resolveLocationAncestryCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'derives business identity from canonical ancestry',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          resolveLocationAncestryCellDeclaration.contract.input.decode(
            'location-1',
          ).kind,
        ).toBe('valid');
        const resolveBusinessId = vi.fn(async () => 'business-1');
        const resolve = makeResolveLocationAncestry({ resolveBusinessId });

        await expect(resolve('location-1')).resolves.toEqual({
          locationId: 'location-1',
          businessId: 'business-1',
        });
        expect(resolveBusinessId).toHaveBeenCalledWith('location-1');
      },
    },
  ],
});

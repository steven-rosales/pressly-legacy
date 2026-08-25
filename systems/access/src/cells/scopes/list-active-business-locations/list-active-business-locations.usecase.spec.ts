import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listActiveBusinessLocationsCellDeclaration } from './cell.ts';
import { makeListActiveBusinessLocations } from './list-active-business-locations.usecase.ts';

proveOperation({
  operationId: 'access.list-active-business-locations.v1',
  declaration: listActiveBusinessLocationsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves repository ordering and location facts',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          listActiveBusinessLocationsCellDeclaration.contract.input.decode(
            'business-1',
          ).kind,
        ).toBe('valid');
        const listActiveLocations = vi.fn(async () => [
          { id: 'east', name: 'East', timezone: 'America/New_York' },
          { id: 'west', name: 'West', timezone: 'America/New_York' },
        ]);
        const list = makeListActiveBusinessLocations({ listActiveLocations });

        await expect(list('business-1')).resolves.toEqual({
          locations: [
            { id: 'east', name: 'East', timezone: 'America/New_York' },
            { id: 'west', name: 'West', timezone: 'America/New_York' },
          ],
        });
        expect(listActiveLocations).toHaveBeenCalledWith('business-1');
      },
    },
  ],
});

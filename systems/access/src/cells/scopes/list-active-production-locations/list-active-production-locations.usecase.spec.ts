import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listActiveProductionLocationsCellDeclaration } from './cell.ts';
import { makeListActiveProductionLocations } from './list-active-production-locations.usecase.ts';

proveOperation({
  operationId: 'access.list-active-production-locations.v1',
  declaration: listActiveProductionLocationsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves business and name ordering with raw facts',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          listActiveProductionLocationsCellDeclaration.contract.input.decode(
            null,
          ).kind,
        ).toBe('valid');
        const listActiveLocations = vi.fn(async () => [
          {
            id: 'east',
            businessId: 'business-a',
            name: 'East',
            timezone: 'America/New_York',
          },
          {
            id: 'west',
            businessId: 'business-b',
            name: 'West',
            timezone: 'America/Chicago',
          },
        ]);
        const list = makeListActiveProductionLocations({ listActiveLocations });

        await expect(list(null)).resolves.toEqual({
          locations: [
            {
              id: 'east',
              businessId: 'business-a',
              name: 'East',
              timezone: 'America/New_York',
            },
            {
              id: 'west',
              businessId: 'business-b',
              name: 'West',
              timezone: 'America/Chicago',
            },
          ],
        });
        expect(listActiveLocations).toHaveBeenCalledOnce();
      },
    },
  ],
});

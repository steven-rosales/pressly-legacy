import { proveOperation } from '@pressly/testkit/operation-proof';
import { listLocationsCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { listLocationsContract } from './contract.ts';

describe('list-locations contract', () => {
  proveOperation({
    operationId: 'production.list-locations.v1',
    declaration: listLocationsCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves boolean coercion, the default, and authorization-derived scope',
        proves: ['contract'],
        run: () => {
          expect(
            listLocationsContract.input.decode({
              query: {},
              allowedLocationIds: null,
            }),
          ).toEqual({
            kind: 'valid',
            value: { includeInactive: false, allowedLocationIds: null },
          });
          expect(
            listLocationsContract.input.decode({
              query: { includeInactive: 'true' },
              allowedLocationIds: ['location-2'],
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              includeInactive: true,
              allowedLocationIds: ['location-2'],
            },
          });
        },
      },
    ],
  });
});

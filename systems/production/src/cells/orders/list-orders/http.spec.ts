import { proveOperation } from '@pressly/testkit/operation-proof';
import { listOrdersCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { listOrdersHttpSurfaces } from './http.ts';

const surface = listOrdersHttpSurfaces[0];

describe('list-orders HTTP surface', () => {
  proveOperation({
    operationId: 'production.list-orders.v1',
    declaration: listOrdersCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves route and validates query before params',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            method: 'GET',
            path: '/production/locations/:locationId/orders',
          });
          expect(() =>
            surface?.toSerializedInput({
              params: {},
              query: { unexpected: true },
              headers: {},
              body: undefined,
              context: {},
            }),
          ).toThrow(
            expect.objectContaining({
              code: 'invalid_query_type',
              publicDetails: expect.objectContaining({ location: 'query' }),
            }),
          );
        },
      },
    ],
  });
});

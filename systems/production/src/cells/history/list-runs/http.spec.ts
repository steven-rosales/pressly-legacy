import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryRunsCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { listHistoryRunsHttpSurfaces } from './http.ts';

const surface = listHistoryRunsHttpSurfaces[0];

describe('list-history-runs HTTP surface', () => {
  proveOperation({
    operationId: 'production.list-history-runs.v1',
    declaration: listHistoryRunsCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves the route and validates query before params',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            method: 'GET',
            path: '/production/locations/:locationId/history/runs',
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

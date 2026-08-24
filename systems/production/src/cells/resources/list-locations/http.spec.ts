import { proveOperation } from '@pressly/testkit/operation-proof';
import { listLocationsCellDeclaration } from './cell.ts';
import { describe, expect } from 'vitest';
import { listLocationsHttpSurfaces } from './http.ts';

const surface = listLocationsHttpSurfaces[0];

describe('list-locations HTTP surface', () => {
  proveOperation({
    operationId: 'production.list-locations.v1',
    declaration: listLocationsCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'keeps the exact route and reads location scope only after query validation',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            method: 'GET',
            path: '/production/locations',
            contextRequirements: ['allowed-production-location-ids'],
          });
          expect(
            surface?.validateRequest?.({
              params: {},
              query: { includeInactive: 'false' },
              headers: {},
              body: undefined,
            }),
          ).toBeUndefined();
          expect(
            surface?.toSerializedInput({
              params: {},
              query: { includeInactive: 'false' },
              headers: {},
              body: undefined,
              context: { allowedLocationIds: ['location-1'] },
            }),
          ).toEqual({
            query: { includeInactive: false },
            allowedLocationIds: ['location-1'],
          });
          expect(() =>
            surface?.validateRequest?.({
              params: {},
              query: { unexpected: true },
              headers: {},
              body: undefined,
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

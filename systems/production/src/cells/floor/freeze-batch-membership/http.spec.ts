import { proveOperation } from '@pressly/testkit/operation-proof';
import { freezeBatchMembershipCellDeclaration } from './cell.ts';
import type { HttpRequest } from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect } from 'vitest';
import { freezeBatchMembershipHttpSurfaces } from './http.ts';

const request = (body: unknown, batchId = 'bad'): HttpRequest => ({
  params: {
    locationId: 'location-1',
    productionRunId: '10000000-0000-4000-8000-000000000001',
    productionBatchId: batchId,
  },
  query: {},
  headers: {},
  body,
  context: { actorId: 'actor-1' },
});

describe('freeze batch membership HTTP boundary', () => {
  proveOperation({
    operationId: 'production.freeze-batch-membership.v1',
    declaration: freezeBatchMembershipCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves body-before-params failure precedence',
        proves: ['protocol'],
        run: () => {
          const surface = freezeBatchMembershipHttpSurfaces[0]!;
          try {
            surface.toSerializedInput(request({}));
            expect.unreachable();
          } catch (error) {
            expect(isAppError(error) && error.code).toBe('invalid_body_type');
          }
          try {
            surface.toSerializedInput(
              request({
                expectedQueueVersion: 4,
                expectedBatchVersion: 7,
                idempotencyKey: 'freeze-1',
              }),
            );
            expect.unreachable();
          } catch (error) {
            expect(isAppError(error) && error.code).toBe('invalid_params_type');
          }
        },
      },
    ],
  });
});

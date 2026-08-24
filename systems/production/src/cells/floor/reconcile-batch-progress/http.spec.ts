import { proveOperation } from '@pressly/testkit/operation-proof';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';
import type { HttpRequest } from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect } from 'vitest';
import { reconcileBatchProgressHttpSurfaces } from './http.ts';

const request = (body: unknown, batch = 'bad'): HttpRequest => ({
  params: {
    locationId: 'location-1',
    productionRunId: '10000000-0000-4000-8000-000000000001',
    productionBatchId: batch,
  },
  query: {},
  headers: {},
  body,
  context: { actorId: 'actor-1' },
});
const validBody = {
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  expectedStageVersions: [11, 12, 13, 14].map((suffix) => ({
    stageRunId: `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
    version: 1,
  })),
  target: 'sorting_started',
  reason: 'updates_missed',
  machineIds: [],
  idempotencyKey: 'reconcile-1',
};

describe('reconcile batch progress HTTP boundary', () => {
  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves body-before-params failure precedence',
        proves: ['protocol'],
        run: () => {
          const surface = reconcileBatchProgressHttpSurfaces[0]!;
          try {
            surface.toSerializedInput(request({}));
            expect.unreachable();
          } catch (error) {
            expect(isAppError(error) && error.code).toBe('invalid_body_type');
          }
          try {
            surface.toSerializedInput(request(validBody));
            expect.unreachable();
          } catch (error) {
            expect(isAppError(error) && error.code).toBe('invalid_params_type');
          }
        },
      },
    ],
  });
});

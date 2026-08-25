import { proveOperation } from '@pressly/testkit/operation-proof';
import { assignStageMachinesCellDeclaration } from './cell.ts';
import type { HttpRequest } from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect } from 'vitest';
import { assignStageMachinesHttpSurfaces } from './http.ts';

const request = (body: unknown, stageRunId = 'bad'): HttpRequest => ({
  params: { locationId: 'location-1', stageRunId },
  query: {},
  headers: {},
  body,
  context: { actorId: 'actor-1' },
});

describe('assign stage machines HTTP boundary', () => {
  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves body-before-params failure precedence',
        proves: ['protocol'],
        run: () => {
          const surface = assignStageMachinesHttpSurfaces[0]!;
          try {
            surface.toSerializedInput(request({ machineIds: [] }));
            expect.unreachable();
          } catch (error) {
            expect(isAppError(error) && error.code).toBe('invalid_body_type');
          }
          try {
            surface.toSerializedInput(
              request({
                machineIds: ['10000000-0000-4000-8000-000000000003'],
                expectedVersion: 2,
                idempotencyKey: 'assign-1',
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

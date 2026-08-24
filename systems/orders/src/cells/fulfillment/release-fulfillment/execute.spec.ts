import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofFulfillmentId,
  ordersUnitProofMutationResult,
} from '../../../testing/operation.spec-support.ts';
import { releaseFulfillmentCellDeclaration } from './cell.ts';
import { validateReleaseFulfillment } from './decide.ts';
import { makeExecuteReleaseFulfillment } from './execute.ts';
import { releaseFulfillmentHttpSurfaces } from './http.ts';
import type { ReleaseFulfillmentCommand } from './types.ts';

const command: ReleaseFulfillmentCommand = {
  businessId: 'business-1',
  fulfillmentId: ordersUnitProofFulfillmentId,
  locationId: 'east',
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  idempotencyKey: 'release-fulfillment-1',
  context: ordersUnitProofContext,
  reasonCode: 'ready_for_production',
  reasonNote: null,
};

proveOperation({
  operationId: 'orders.release-fulfillment.v1',
  declaration: releaseFulfillmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts releasable evidence and rejects an invalid fulfillment version purely',
      proves: ['decision'],
      run: () => {
        expect(validateReleaseFulfillment(command)).toBeNull();
        expect(
          validateReleaseFulfillment({
            ...command,
            expectedFulfillmentVersion: 0,
          }),
        ).toMatchObject({ code: 'fulfillment_release_command_invalid' });
      },
    },
    {
      name: 'executes release only after validation and preserves the writer result',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteReleaseFulfillment({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact fulfillment-release HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = releaseFulfillmentHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
        });
        expect(
          surface?.present({
            kind: 'success',
            value: ordersUnitProofMutationResult,
          }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});

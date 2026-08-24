import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofFulfillmentId,
  ordersUnitProofMutationResult,
} from '../../../testing/operation.spec-support.ts';
import { withdrawFulfillmentCellDeclaration } from './cell.ts';
import { validateWithdrawFulfillment } from './decide.ts';
import { makeExecuteWithdrawFulfillment } from './execute.ts';
import { withdrawFulfillmentHttpSurfaces } from './http.ts';
import type { WithdrawFulfillmentCommand } from './types.ts';

const command: WithdrawFulfillmentCommand = {
  businessId: 'business-1',
  fulfillmentId: ordersUnitProofFulfillmentId,
  locationId: 'east',
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  idempotencyKey: 'withdraw-fulfillment-1',
  context: ordersUnitProofContext,
  reasonCode: 'production_hold',
  reasonNote: 'Hold this fulfillment before production starts.',
};

proveOperation({
  operationId: 'orders.withdraw-fulfillment.v1',
  declaration: withdrawFulfillmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts withdrawal evidence and rejects an invalid fulfillment version purely',
      proves: ['decision'],
      run: () => {
        expect(validateWithdrawFulfillment(command)).toBeNull();
        expect(
          validateWithdrawFulfillment({
            ...command,
            expectedFulfillmentVersion: 0,
          }),
        ).toMatchObject({ code: 'fulfillment_release_command_invalid' });
      },
    },
    {
      name: 'executes withdrawal only after validation and preserves the writer result',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteWithdrawFulfillment({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact fulfillment-withdrawal HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = withdrawFulfillmentHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
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

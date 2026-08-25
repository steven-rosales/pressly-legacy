import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofProposalDecisionResult,
  ordersUnitProofProposalId,
} from '../../../testing/operation.spec-support.ts';
import { rejectIncomingOrderProposalCellDeclaration } from './cell.ts';
import { makeExecuteRejectIncomingOrderProposal } from './execute.ts';
import { rejectIncomingOrderProposalHttpSurfaces } from './http.ts';
import type { RejectIncomingOrderProposalCommand } from './types.ts';

const command: RejectIncomingOrderProposalCommand = {
  proposalId: ordersUnitProofProposalId,
  locationId: 'east',
  expectedVersion: 1,
  idempotencyKey: 'reject-proposal-1',
  context: ordersUnitProofContext,
  reasonCode: 'manager_rejected',
  reasonNote: null,
};
const result = {
  ...ordersUnitProofProposalDecisionResult,
  state: 'rejected' as const,
  orderId: null,
  fulfillmentId: null,
};

proveOperation({
  operationId: 'orders.reject-incoming-order-proposal.v1',
  declaration: rejectIncomingOrderProposalCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'forwards the exact rejection command and preserves the rejected proposal identity',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: result,
        }));
        await expect(
          makeExecuteRejectIncomingOrderProposal({ writer })(command),
        ).resolves.toEqual({ kind: 'success', value: result });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact proposal-rejection HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = rejectIncomingOrderProposalHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
        });
        expect(
          surface?.present({ kind: 'success', value: result }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});

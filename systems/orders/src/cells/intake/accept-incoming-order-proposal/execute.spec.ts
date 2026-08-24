import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofProposalDecisionResult,
  ordersUnitProofProposalId,
} from '../../../testing/operation.spec-support.ts';
import { acceptIncomingOrderProposalCellDeclaration } from './cell.ts';
import { makeExecuteAcceptIncomingOrderProposal } from './execute.ts';
import { acceptIncomingOrderProposalHttpSurfaces } from './http.ts';
import type { AcceptIncomingOrderProposalCommand } from './types.ts';

const command: AcceptIncomingOrderProposalCommand = {
  proposalId: ordersUnitProofProposalId,
  locationId: 'east',
  expectedVersion: 1,
  idempotencyKey: 'accept-proposal-1',
  context: ordersUnitProofContext,
  reasonCode: 'incoming_order_accepted',
  reasonNote: null,
};

proveOperation({
  operationId: 'orders.accept-incoming-order-proposal.v1',
  declaration: acceptIncomingOrderProposalCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'forwards the exact acceptance command and preserves canonical identity',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofProposalDecisionResult,
        }));
        await expect(
          makeExecuteAcceptIncomingOrderProposal({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofProposalDecisionResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact proposal-acceptance HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = acceptIncomingOrderProposalHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
        });
        expect(
          surface?.present({
            kind: 'success',
            value: ordersUnitProofProposalDecisionResult,
          }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});

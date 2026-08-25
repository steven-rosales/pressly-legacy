import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofProposalId,
} from '../../../testing/operation.spec-support.ts';
import { restoreIncomingOrderProposalCellDeclaration } from './cell.ts';
import { makeExecuteRestoreIncomingOrderProposal } from './execute.ts';
import { restoreIncomingOrderProposalHttpSurfaces } from './http.ts';
import type { RestoreIncomingOrderProposalCommand } from './types.ts';

const command: RestoreIncomingOrderProposalCommand = {
  proposalId: ordersUnitProofProposalId,
  locationId: 'east',
  expectedVersion: 2,
  idempotencyKey: 'restore-proposal-1',
  context: ordersUnitProofContext,
  reasonCode: 'source_closure_overridden',
  reasonNote: null,
};
const result = {
  proposalId: ordersUnitProofProposalId,
  state: 'restored_pending' as const,
  version: 3,
  replayed: false,
};

proveOperation({
  operationId: 'orders.restore-incoming-order-proposal.v1',
  declaration: restoreIncomingOrderProposalCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'forwards the exact restoration command and preserves the restored version',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: result,
        }));
        await expect(
          makeExecuteRestoreIncomingOrderProposal({ writer })(command),
        ).resolves.toEqual({ kind: 'success', value: result });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact proposal-restoration HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = restoreIncomingOrderProposalHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
        });
        expect(
          surface?.present({ kind: 'success', value: result }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});

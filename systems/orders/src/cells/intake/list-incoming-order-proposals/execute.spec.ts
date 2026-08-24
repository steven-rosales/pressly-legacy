import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listIncomingOrderProposalsCellDeclaration } from './cell.ts';
import {
  decodeIncomingOrderProposalCursor,
  encodeIncomingOrderProposalCursor,
  validateListIncomingOrderProposals,
} from './decide.ts';
import { makeExecuteListIncomingOrderProposals } from './execute.ts';
import { listIncomingOrderProposalsHttpSurfaces } from './http.ts';

const query = {
  locationId: 'east',
  limit: 25,
  cursor: null,
  view: 'needs_review' as const,
};
const result = { items: [], nextCursor: null };

proveOperation({
  operationId: 'orders.list-incoming-order-proposals.v1',
  declaration: listIncomingOrderProposalsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'validates bounds and round-trips the view-bound keyset cursor purely',
      proves: ['decision'],
      run: () => {
        expect(validateListIncomingOrderProposals(query)).toBeNull();
        expect(
          validateListIncomingOrderProposals({ ...query, limit: 101 }),
        ).toMatchObject({ code: 'incoming_order_proposal_query_invalid' });
        const cursor = {
          view: query.view,
          observedAt: new Date('2026-08-22T16:00:00.000Z'),
          id: 'proposal-1',
        };
        expect(
          decodeIncomingOrderProposalCursor(
            encodeIncomingOrderProposalCursor(cursor),
          ),
        ).toEqual(cursor);
      },
    },
    {
      name: 'executes the validated proposal query with an explicit decoded cursor',
      proves: ['executor-success'],
      run: async () => {
        const list = vi.fn(async () => result);
        await expect(
          makeExecuteListIncomingOrderProposals({ list })(query),
        ).resolves.toEqual({ kind: 'success', value: result });
        expect(list).toHaveBeenCalledWith({ query, cursor: null });
      },
    },
    {
      name: 'rejects an invalid incoming-proposal cursor without querying the repository',
      proves: ['decision'],
      run: async () => {
        const list = vi.fn(async () => result);
        await expect(
          makeExecuteListIncomingOrderProposals({ list })({
            ...query,
            cursor: 'not-a-valid-cursor',
          }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'incoming_order_proposal_cursor_invalid',
            message: 'The incoming Order proposal cursor is invalid.',
          },
        });
        expect(list).not.toHaveBeenCalled();
      },
    },
    {
      name: 'declares and presents the exact incoming-proposal list HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = listIncomingOrderProposalsHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'GET',
          path: '/order-management/locations/:locationId/incoming-orders',
        });
        expect(
          surface?.present({ kind: 'success', value: result }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});

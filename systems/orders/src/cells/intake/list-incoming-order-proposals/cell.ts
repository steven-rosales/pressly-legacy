import { bindCell, declareQueryCell } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { listIncomingOrderProposalsContract } from './contract.ts';
import { makeExecuteListIncomingOrderProposals } from './execute.ts';
import { listIncomingOrderProposalsHttpSurfaces } from './http.ts';
import { makeListIncomingOrderProposalsPostgresRepository } from './postgres.ts';
import {
  listIncomingOrderProposalsOperationId,
  type IncomingOrderProposalListResult,
  type ListIncomingOrderProposalsExpectedFailure,
  type ListIncomingOrderProposalsQuery,
} from './types.ts';

export const listIncomingOrderProposalsCellDeclaration = declareQueryCell<
  ListIncomingOrderProposalsQuery,
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure
>({
  id: listIncomingOrderProposalsOperationId,
  authentication: 'required',
  contract: listIncomingOrderProposalsContract,
  authorization: {
    capability: 'orders:manage',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: listIncomingOrderProposalsHttpSurfaces,
  observability: { operation: 'orders.list_incoming_order_proposals' },
});

export const makeListIncomingOrderProposalsCell = (
  db: PostgresDatabase,
  orders: Pick<
    OrdersSchema,
    | 'orderSourceLinks'
    | 'orderSourceProposals'
    | 'orderSourceTerminalTombstones'
  >,
) =>
  bindCell(
    listIncomingOrderProposalsCellDeclaration,
    makeExecuteListIncomingOrderProposals(
      makeListIncomingOrderProposalsPostgresRepository(db, orders),
    ),
  );

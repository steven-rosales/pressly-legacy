import { bindCell, declareQueryCell } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { CanonicalOrderDetail } from '../../../model/canonical-order/model.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { getCanonicalOrderContract } from './contract.ts';
import { makeExecuteGetCanonicalOrder } from './execute.ts';
import { makeGetCanonicalOrderPostgresRepository } from './postgres.ts';
import {
  getCanonicalOrderOperationId,
  type GetCanonicalOrderExpectedFailure,
  type GetCanonicalOrderQuery,
} from './types.ts';

export const getCanonicalOrderCellDeclaration = declareQueryCell<
  GetCanonicalOrderQuery,
  CanonicalOrderDetail,
  GetCanonicalOrderExpectedFailure
>({
  id: getCanonicalOrderOperationId,
  authentication: 'none',
  contract: getCanonicalOrderContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'orders.get_canonical_order' },
});

export const makeGetCanonicalOrderCell = (dependencies: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderFulfillments' | 'orderItems' | 'orders'>;
}) =>
  bindCell(
    getCanonicalOrderCellDeclaration,
    makeExecuteGetCanonicalOrder(
      makeGetCanonicalOrderPostgresRepository(dependencies),
    ),
  );

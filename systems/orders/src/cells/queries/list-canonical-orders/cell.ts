import { defineOperation } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { listCanonicalOrdersContract } from './contract.ts';
import { makeExecuteListCanonicalOrders } from './execute.ts';
import { makeListCanonicalOrdersPostgresRepository } from './postgres.ts';
import {
  listCanonicalOrdersOperationId,
  type CanonicalOrderListResult,
  type ListCanonicalOrdersExpectedFailure,
  type ListCanonicalOrdersQuery,
} from './types.ts';

export const listCanonicalOrdersCellDeclaration = defineOperation<
  ListCanonicalOrdersQuery,
  CanonicalOrderListResult,
  ListCanonicalOrdersExpectedFailure
>({
  kind: 'query',
  id: listCanonicalOrdersOperationId,
  authentication: 'none',
  contract: listCanonicalOrdersContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'orders.list_canonical_orders' },
});

export const makeListCanonicalOrdersCell = (dependencies: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderFulfillments' | 'orders'>;
}) =>
  defineOperation(
    listCanonicalOrdersCellDeclaration,
    makeExecuteListCanonicalOrders(
      makeListCanonicalOrdersPostgresRepository(dependencies),
    ),
  );

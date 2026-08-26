import type { ListProductionOrdersResult } from './boundary.ts';
import { defineOperation } from '@pressly/cells';
import { listOrdersContract } from './contract.ts';
import {
  makeExecuteListOrders,
  type ListOrdersDependencies,
} from './execute.ts';
import { listOrdersHttpSurfaces } from './http.ts';
import {
  listOrdersOperationId,
  type ListOrdersExpectedFailure,
  type ListOrdersInput,
} from './types.ts';

export const listOrdersCellDeclaration = defineOperation<
  ListOrdersInput,
  ListProductionOrdersResult,
  ListOrdersExpectedFailure
>({
  kind: 'query',
  id: listOrdersOperationId,
  contract: listOrdersContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  surfaces: listOrdersHttpSurfaces,
  observability: { operation: 'production.list_orders' },
});

export const makeListOrdersCell = (dependencies: ListOrdersDependencies) =>
  defineOperation(
    listOrdersCellDeclaration,
    makeExecuteListOrders(dependencies),
  );

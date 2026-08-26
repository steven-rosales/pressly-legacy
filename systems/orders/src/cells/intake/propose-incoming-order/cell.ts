import { defineOperation } from '@pressly/cells';
import { proposeIncomingOrderContract } from './contract.ts';
import {
  makeExecuteProposeIncomingOrder,
  type ProposeIncomingOrderDependencies,
} from './execute.ts';
import {
  proposeIncomingOrderOperationId,
  type ProposeIncomingOrderCommand,
  type ProposeIncomingOrderExpectedFailure,
  type ProposeIncomingOrderResult,
} from './types.ts';

export const proposeIncomingOrderCellDeclaration = defineOperation<
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderResult,
  ProposeIncomingOrderExpectedFailure
>({
  kind: 'command',
  id: proposeIncomingOrderOperationId,
  authentication: 'none',
  contract: proposeIncomingOrderContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => `${input.source}:${input.externalOrderId}`,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.propose_incoming_order' },
});

export const makeProposeIncomingOrderCell = (
  dependencies: ProposeIncomingOrderDependencies,
) =>
  defineOperation(
    proposeIncomingOrderCellDeclaration,
    makeExecuteProposeIncomingOrder(dependencies),
  );

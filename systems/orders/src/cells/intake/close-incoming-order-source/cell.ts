import { bindCell, declareCommandCell } from '@pressly/cells';
import { closeIncomingOrderSourceContract } from './contract.ts';
import {
  closeIncomingOrderSourceCommandHash,
  closeIncomingOrderSourceIdempotencyKey,
  makeExecuteCloseIncomingOrderSource,
  type CloseIncomingOrderSourceDependencies,
} from './execute.ts';
import {
  closeIncomingOrderSourceOperationId,
  type CloseIncomingOrderSourceCommand,
  type CloseIncomingOrderSourceExpectedFailure,
  type CloseIncomingOrderSourceResult,
} from './types.ts';

export const closeIncomingOrderSourceCellDeclaration = declareCommandCell<
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
  CloseIncomingOrderSourceExpectedFailure
>({
  id: closeIncomingOrderSourceOperationId,
  authentication: 'none',
  contract: closeIncomingOrderSourceContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => `${input.source}:${input.externalOrderId}`,
  },
  idempotency: {
    required: true,
    key: closeIncomingOrderSourceIdempotencyKey,
    fingerprint: closeIncomingOrderSourceCommandHash,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.close_incoming_order_source' },
});

export const makeCloseIncomingOrderSourceCell = (
  dependencies: CloseIncomingOrderSourceDependencies,
) =>
  bindCell(
    closeIncomingOrderSourceCellDeclaration,
    makeExecuteCloseIncomingOrderSource(dependencies),
  );

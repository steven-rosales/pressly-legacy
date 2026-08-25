import { bindCell, declareCommandCell } from '@pressly/cells';
import { completeOrderOutboxContract } from './contract.ts';
import {
  makeExecuteCompleteOrderOutbox,
  type CompleteOrderOutboxDependencies,
} from './execute.ts';
import {
  completeOrderOutboxOperationId,
  type CompleteOrderOutboxCommand,
  type CompleteOrderOutboxExpectedFailure,
  type CompleteOrderOutboxResult,
} from './types.ts';

export const completeOrderOutboxCellDeclaration = declareCommandCell<
  CompleteOrderOutboxCommand,
  CompleteOrderOutboxResult,
  CompleteOrderOutboxExpectedFailure
>({
  id: completeOrderOutboxOperationId,
  authentication: 'none',
  contract: completeOrderOutboxContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.eventId,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.complete_order_outbox' },
});

export const makeCompleteOrderOutboxCell = (
  dependencies: CompleteOrderOutboxDependencies,
) =>
  bindCell(
    completeOrderOutboxCellDeclaration,
    makeExecuteCompleteOrderOutbox(dependencies),
  );

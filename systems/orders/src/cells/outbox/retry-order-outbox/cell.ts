import { bindCell, declareCommandCell } from '@pressly/cells';
import { retryOrderOutboxContract } from './contract.ts';
import { makeExecuteRetryOrderOutbox } from './execute.ts';
import {
  retryOrderOutboxOperationId,
  type RetryOrderOutboxCommand,
  type RetryOrderOutboxExpectedFailure,
  type RetryOrderOutboxRepository,
  type RetryOrderOutboxResult,
} from './types.ts';

export const retryOrderOutboxCellDeclaration = declareCommandCell<
  RetryOrderOutboxCommand,
  RetryOrderOutboxResult,
  RetryOrderOutboxExpectedFailure
>({
  id: retryOrderOutboxOperationId,
  authentication: 'none',
  contract: retryOrderOutboxContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.eventId,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.retry_order_outbox' },
});

export const makeRetryOrderOutboxCell = (
  repository: RetryOrderOutboxRepository,
) =>
  bindCell(
    retryOrderOutboxCellDeclaration,
    makeExecuteRetryOrderOutbox(repository),
  );

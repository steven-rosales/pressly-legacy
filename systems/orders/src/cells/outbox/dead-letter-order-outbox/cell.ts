import { bindCell, declareCommandCell } from '@pressly/cells';
import { deadLetterOrderOutboxContract } from './contract.ts';
import {
  makeExecuteDeadLetterOrderOutbox,
  type DeadLetterOrderOutboxDependencies,
} from './execute.ts';
import {
  deadLetterOrderOutboxOperationId,
  type DeadLetterOrderOutboxCommand,
  type DeadLetterOrderOutboxExpectedFailure,
  type DeadLetterOrderOutboxResult,
} from './types.ts';

export const deadLetterOrderOutboxCellDeclaration = declareCommandCell<
  DeadLetterOrderOutboxCommand,
  DeadLetterOrderOutboxResult,
  DeadLetterOrderOutboxExpectedFailure
>({
  id: deadLetterOrderOutboxOperationId,
  authentication: 'none',
  contract: deadLetterOrderOutboxContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.eventId,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.dead_letter_order_outbox' },
});

export const makeDeadLetterOrderOutboxCell = (
  dependencies: DeadLetterOrderOutboxDependencies,
) =>
  bindCell(
    deadLetterOrderOutboxCellDeclaration,
    makeExecuteDeadLetterOrderOutbox(dependencies),
  );

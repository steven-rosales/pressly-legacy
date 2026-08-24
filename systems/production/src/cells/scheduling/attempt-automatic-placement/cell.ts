import { bindCell, declareCommandCell } from '@pressly/cells';
import { attemptAutomaticPlacementContract } from './contract.ts';
import {
  makeExecuteAttemptAutomaticPlacement,
  type AttemptAutomaticPlacementDependencies,
} from './execute.ts';
import {
  attemptAutomaticPlacementOperationId,
  type AttemptAutomaticPlacementCommand,
  type AttemptAutomaticPlacementExpectedFailure,
  type AttemptAutomaticPlacementResult,
} from './types.ts';

export const attemptAutomaticPlacementCellDeclaration = declareCommandCell<
  AttemptAutomaticPlacementCommand,
  AttemptAutomaticPlacementResult,
  AttemptAutomaticPlacementExpectedFailure
>({
  id: attemptAutomaticPlacementOperationId,
  authentication: 'none',
  contract: attemptAutomaticPlacementContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.locationId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'production.attempt_automatic_placement' },
});

export const makeAttemptAutomaticPlacementCell = (
  deps: AttemptAutomaticPlacementDependencies,
) =>
  bindCell(
    attemptAutomaticPlacementCellDeclaration,
    makeExecuteAttemptAutomaticPlacement(deps),
  );

import { bindCell, declareCommandCell } from '@pressly/cells';
import { replaceShiftSelectionContract } from './contract.ts';
import { replaceShiftSelectionOperationId } from './decide.ts';
import {
  makeExecuteReplaceShiftSelection,
  type ReplaceShiftSelectionDependencies,
} from './execute.ts';
import { replaceShiftSelectionHttpSurfaces } from './http.ts';
import type {
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionExpectedFailure,
  ReplaceShiftSelectionResult,
} from './types.ts';

export const replaceShiftSelectionCellDeclaration = declareCommandCell<
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionResult,
  ReplaceShiftSelectionExpectedFailure
>({
  id: replaceShiftSelectionOperationId,
  contract: replaceShiftSelectionContract,
  authorization: {
    capability: 'production:schedule',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: replaceShiftSelectionHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.replace_shift_selection' },
});

export const makeReplaceShiftSelectionCell = <StoredWorkEvent>(
  deps: ReplaceShiftSelectionDependencies<StoredWorkEvent>,
) =>
  bindCell(
    replaceShiftSelectionCellDeclaration,
    makeExecuteReplaceShiftSelection(deps),
  );

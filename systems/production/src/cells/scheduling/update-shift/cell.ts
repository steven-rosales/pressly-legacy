import { bindCell, declareCommandCell } from '@pressly/cells';
import { updateShiftContract } from './contract.ts';
import { updateShiftOperationId } from './decide.ts';
import {
  makeExecuteUpdateShift,
  type UpdateShiftDependencies,
} from './execute.ts';
import { updateShiftHttpSurfaces } from './http.ts';
import type {
  UpdateShiftCommand,
  UpdateShiftExpectedFailure,
  UpdateShiftResult,
} from './types.ts';

export const updateShiftCellDeclaration = declareCommandCell<
  UpdateShiftCommand,
  UpdateShiftResult,
  UpdateShiftExpectedFailure
>({
  id: updateShiftOperationId,
  contract: updateShiftContract,
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
  surfaces: updateShiftHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.update_shift' },
});

export const makeUpdateShiftCell = <StoredWorkEvent>(
  deps: UpdateShiftDependencies<StoredWorkEvent>,
) => bindCell(updateShiftCellDeclaration, makeExecuteUpdateShift(deps));

import { bindCell, declareCommandCell } from '@pressly/cells';
import { createShiftContract } from './contract.ts';
import { createShiftOperationId } from './decide.ts';
import {
  makeExecuteCreateShift,
  type CreateShiftDependencies,
} from './execute.ts';
import { createShiftHttpSurfaces } from './http.ts';
import type {
  CreateShiftCommand,
  CreateShiftExpectedFailure,
  ProductionShift,
} from './types.ts';

export const createShiftCellDeclaration = declareCommandCell<
  CreateShiftCommand,
  ProductionShift,
  CreateShiftExpectedFailure
>({
  id: createShiftOperationId,
  contract: createShiftContract,
  authorization: {
    capability: 'production:schedule',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'none' },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: createShiftHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.create_shift' },
});

export const makeCreateShiftCell = <StoredWorkEvent>(
  deps: CreateShiftDependencies<StoredWorkEvent>,
) => bindCell(createShiftCellDeclaration, makeExecuteCreateShift(deps));

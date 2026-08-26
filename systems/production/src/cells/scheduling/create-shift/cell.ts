import { defineOperation } from '@pressly/cells';
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

export const createShiftCellDeclaration = defineOperation<
  CreateShiftCommand,
  ProductionShift,
  CreateShiftExpectedFailure
>({
  kind: 'command',
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
) => defineOperation(createShiftCellDeclaration, makeExecuteCreateShift(deps));

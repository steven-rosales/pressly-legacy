import { bindCell, declareCommandCell } from '@pressly/cells';
import { changeAdmissionContract } from './contract.ts';
import { changeAdmissionOperationId } from './decide.ts';
import {
  makeExecuteChangeAdmission,
  type ChangeAdmissionDependencies,
} from './execute.ts';
import { changeAdmissionHttpSurfaces } from './http.ts';
import type {
  ChangeAdmissionCommand,
  ChangeAdmissionExpectedFailure,
  ChangeAdmissionResult,
} from './types.ts';

export const changeAdmissionCellDeclaration = declareCommandCell<
  ChangeAdmissionCommand,
  ChangeAdmissionResult,
  ChangeAdmissionExpectedFailure
>({
  id: changeAdmissionOperationId,
  contract: changeAdmissionContract,
  authorization: {
    capability: 'production:admission',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  surfaces: changeAdmissionHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.change_admission' },
});

export const makeChangeAdmissionCell = <StoredWorkEvent>(
  dependencies: ChangeAdmissionDependencies<StoredWorkEvent>,
) =>
  bindCell(
    changeAdmissionCellDeclaration,
    makeExecuteChangeAdmission(dependencies),
  );

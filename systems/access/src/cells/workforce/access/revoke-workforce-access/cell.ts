import { bindCell, declareCommandCell } from '@pressly/cells';
import { revokeWorkforceAccessContract } from './contract.ts';
import type { RevokeWorkforceAccess } from './revoke-workforce-access.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const revokeWorkforceAccessCellDeclaration = declareCommandCell<
  OperationInput<RevokeWorkforceAccess>,
  OperationOutput<RevokeWorkforceAccess>,
  OperationFailure<RevokeWorkforceAccess>
>({
  id: 'access.revoke-workforce-access.v1',
  authentication: 'required',
  contract: revokeWorkforceAccessContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.revoke_workforce_access' },
});

export const makeRevokeWorkforceAccessCell = (
  operation: RevokeWorkforceAccess,
) => bindCell(revokeWorkforceAccessCellDeclaration, resultOperation(operation));

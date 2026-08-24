import { bindCell, declareCommandCell } from '@pressly/cells';
import { removeMfaContract } from './contract.ts';
import type { RemoveMfa } from './remove-mfa.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const removeMfaCellDeclaration = declareCommandCell<
  OperationInput<RemoveMfa>,
  OperationOutput<RemoveMfa>,
  OperationFailure<RemoveMfa>
>({
  id: 'access.remove-mfa.v1',
  authentication: 'required',
  contract: removeMfaContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.identityId,
  },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.remove_mfa' },
});

export const makeRemoveMfaCell = (operation: RemoveMfa) =>
  bindCell(removeMfaCellDeclaration, successOperation(operation));

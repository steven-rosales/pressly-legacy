import { bindCell, declareQueryCell } from '@pressly/cells';
import { listIdentitySessionsContract } from './contract.ts';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const listIdentitySessionsCellDeclaration = declareQueryCell<
  OperationInput<ListIdentitySessions>,
  OperationOutput<ListIdentitySessions>,
  OperationFailure<ListIdentitySessions>
>({
  id: 'access.list-identity-sessions.v1',
  authentication: 'required',
  contract: listIdentitySessionsContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.list_identity_sessions' },
});

export const makeListIdentitySessionsCell = (operation: ListIdentitySessions) =>
  bindCell(listIdentitySessionsCellDeclaration, successOperation(operation));

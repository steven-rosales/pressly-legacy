import { bindCell, declareCommandCell } from '@pressly/cells';
import { revokeSessionContract } from './contract.ts';
import type { RevokeSession } from './revoke-session.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const revokeSessionCellDeclaration = declareCommandCell<
  OperationInput<RevokeSession>,
  OperationOutput<RevokeSession>,
  OperationFailure<RevokeSession>
>({
  id: 'access.revoke-session.v1',
  authentication: 'none',
  contract: revokeSessionContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.revoke_session' },
});

export const makeRevokeSessionCell = (operation: RevokeSession) =>
  bindCell(revokeSessionCellDeclaration, successOperation(operation));

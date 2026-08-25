import { bindCell, declareCommandCell } from '@pressly/cells';
import { revokeIdentitySessionsContract } from './contract.ts';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';
import {
  successOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const revokeIdentitySessionsCellDeclaration = declareCommandCell<
  OperationInput<RevokeIdentitySessions>,
  OperationOutput<RevokeIdentitySessions>,
  OperationFailure<RevokeIdentitySessions>
>({
  id: 'access.revoke-identity-sessions.v1',
  authentication: 'required',
  contract: revokeIdentitySessionsContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.identityId,
  },
  idempotency: { required: false },
  surfaces: [],
  observability: { operation: 'identity.revoke_identity_sessions' },
});

export const makeRevokeIdentitySessionsCell = (
  operation: RevokeIdentitySessions,
) =>
  bindCell(revokeIdentitySessionsCellDeclaration, successOperation(operation));

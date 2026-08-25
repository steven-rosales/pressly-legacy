import { bindCell, declareCommandCell } from '@pressly/cells';
import { revokeWorkforceInvitationContract } from './contract.ts';
import type { RevokeWorkforceInvitation } from './revoke-workforce-invitation.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const revokeWorkforceInvitationCellDeclaration = declareCommandCell<
  OperationInput<RevokeWorkforceInvitation>,
  OperationOutput<RevokeWorkforceInvitation>,
  OperationFailure<RevokeWorkforceInvitation>
>({
  id: 'access.revoke-workforce-invitation.v1',
  authentication: 'required',
  contract: revokeWorkforceInvitationContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.revoke_workforce_invitation' },
});

export const makeRevokeWorkforceInvitationCell = (
  operation: RevokeWorkforceInvitation,
) =>
  bindCell(
    revokeWorkforceInvitationCellDeclaration,
    resultOperation(operation),
  );

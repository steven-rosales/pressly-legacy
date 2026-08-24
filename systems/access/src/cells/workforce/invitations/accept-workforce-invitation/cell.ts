import { bindCell, declareCommandCell } from '@pressly/cells';
import { acceptWorkforceInvitationContract } from './contract.ts';
import type { AcceptWorkforceInvitation } from './accept-workforce-invitation.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const acceptWorkforceInvitationCellDeclaration = declareCommandCell<
  OperationInput<AcceptWorkforceInvitation>,
  OperationOutput<AcceptWorkforceInvitation>,
  OperationFailure<AcceptWorkforceInvitation>
>({
  id: 'access.accept-workforce-invitation.v1',
  authentication: 'none',
  contract: acceptWorkforceInvitationContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.rawToken,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.accept_workforce_invitation' },
});

export const makeAcceptWorkforceInvitationCell = (
  operation: AcceptWorkforceInvitation,
) =>
  bindCell(
    acceptWorkforceInvitationCellDeclaration,
    resultOperation(operation),
  );

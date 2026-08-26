import { defineOperation } from '@pressly/cells';
import { reissueWorkforceInvitationContract } from './contract.ts';
import type { ReissueWorkforceInvitation } from './reissue-workforce-invitation.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const reissueWorkforceInvitationCellDeclaration = defineOperation<
  OperationInput<ReissueWorkforceInvitation>,
  OperationOutput<ReissueWorkforceInvitation>,
  OperationFailure<ReissueWorkforceInvitation>
>({
  kind: 'command',
  id: 'access.reissue-workforce-invitation.v1',
  authentication: 'required',
  contract: reissueWorkforceInvitationContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.reissue_workforce_invitation' },
});

export const makeReissueWorkforceInvitationCell = (
  operation: ReissueWorkforceInvitation,
) =>
  defineOperation(
    reissueWorkforceInvitationCellDeclaration,
    resultOperation(operation),
  );

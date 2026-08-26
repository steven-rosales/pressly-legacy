import { defineOperation } from '@pressly/cells';
import { issueWorkforceInvitationContract } from './contract.ts';
import type { IssueWorkforceInvitation } from './issue-workforce-invitation.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const issueWorkforceInvitationCellDeclaration = defineOperation<
  OperationInput<IssueWorkforceInvitation>,
  OperationOutput<IssueWorkforceInvitation>,
  OperationFailure<IssueWorkforceInvitation>
>({
  kind: 'command',
  id: 'access.issue-workforce-invitation.v1',
  authentication: 'required',
  contract: issueWorkforceInvitationContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) =>
      `${input.businessId}:${input.email.trim().toLowerCase()}`,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.issue_workforce_invitation' },
});

export const makeIssueWorkforceInvitationCell = (
  operation: IssueWorkforceInvitation,
) =>
  defineOperation(
    issueWorkforceInvitationCellDeclaration,
    resultOperation(operation),
  );

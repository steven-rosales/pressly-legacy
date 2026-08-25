import { bindCell, declareQueryCell } from '@pressly/cells';
import { listWorkforceInvitationsContract } from './contract.ts';
import type { ListWorkforceInvitations } from './list-workforce-invitations.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const listWorkforceInvitationsCellDeclaration = declareQueryCell<
  OperationInput<ListWorkforceInvitations>,
  OperationOutput<ListWorkforceInvitations>,
  OperationFailure<ListWorkforceInvitations>
>({
  id: 'access.list-workforce-invitations.v1',
  authentication: 'required',
  contract: listWorkforceInvitationsContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.list_workforce_invitations' },
});

export const makeListWorkforceInvitationsCell = (
  operation: ListWorkforceInvitations,
) =>
  bindCell(listWorkforceInvitationsCellDeclaration, resultOperation(operation));

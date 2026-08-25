import { bindCell, declareQueryCell } from '@pressly/cells';
import { listWorkforceMemberSessionsContract } from './contract.ts';
import type { ListWorkforceMemberSessions } from './list-workforce-member-sessions.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const listWorkforceMemberSessionsCellDeclaration = declareQueryCell<
  OperationInput<ListWorkforceMemberSessions>,
  OperationOutput<ListWorkforceMemberSessions>,
  OperationFailure<ListWorkforceMemberSessions>
>({
  id: 'access.list-workforce-member-sessions.v1',
  authentication: 'required',
  contract: listWorkforceMemberSessionsContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'identity.list_workforce_member_sessions' },
});

export const makeListWorkforceMemberSessionsCell = (
  operation: ListWorkforceMemberSessions,
) =>
  bindCell(
    listWorkforceMemberSessionsCellDeclaration,
    resultOperation(operation),
  );

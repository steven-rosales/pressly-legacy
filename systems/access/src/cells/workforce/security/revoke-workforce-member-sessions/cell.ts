import { defineOperation } from '@pressly/cells';
import { revokeWorkforceMemberSessionsContract } from './contract.ts';
import type { RevokeWorkforceMemberSessions } from './revoke-workforce-member-sessions.usecase.ts';
import {
  resultOperation,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';

export const revokeWorkforceMemberSessionsCellDeclaration = defineOperation<
  OperationInput<RevokeWorkforceMemberSessions>,
  OperationOutput<RevokeWorkforceMemberSessions>,
  OperationFailure<RevokeWorkforceMemberSessions>
>({
  kind: 'command',
  id: 'access.revoke-workforce-member-sessions.v1',
  authentication: 'required',
  contract: revokeWorkforceMemberSessionsContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => `${input.businessId}:${input.membershipId}`,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  observability: { operation: 'identity.revoke_workforce_member_sessions' },
});

export const makeRevokeWorkforceMemberSessionsCell = (
  operation: RevokeWorkforceMemberSessions,
) =>
  defineOperation(
    revokeWorkforceMemberSessionsCellDeclaration,
    resultOperation(operation),
  );

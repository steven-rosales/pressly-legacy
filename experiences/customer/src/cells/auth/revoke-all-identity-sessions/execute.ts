import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerRevokeAllIdentitySessionsContract } from './contract.ts';

const accessInput = (
  input: Parameters<
    typeof customerRevokeAllIdentitySessionsContract.input.encode
  >[0],
): AccessInput<'revokeIdentitySessions'> => ({
  principalIdentityId: input.principalIdentityId,
  identityId: input.identityId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerRevokeAllIdentitySessions = (
  input: Parameters<
    typeof customerRevokeAllIdentitySessionsContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<
      typeof customerRevokeAllIdentitySessionsContract.output.encode
    >[0],
    Parameters<
      typeof customerRevokeAllIdentitySessionsContract.failure.encode
    >[0]
  >
>;

export const makeExecuteCustomerRevokeAllIdentitySessions =
  (
    access: AccessExecute<'revokeIdentitySessions'>,
  ): ExecuteCustomerRevokeAllIdentitySessions =>
  (
    input: Parameters<
      typeof customerRevokeAllIdentitySessionsContract.input.encode
    >[0],
  ) =>
    access.execute(accessInput(input));

import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerRevokeIdentitySessionContract } from './contract.ts';

const accessInput = (
  input: Parameters<
    typeof customerRevokeIdentitySessionContract.input.encode
  >[0],
): AccessInput<'revokeIdentitySessions'> => ({
  principalIdentityId: input.principalIdentityId,
  identityId: input.identityId,
  ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerRevokeIdentitySession = (
  input: Parameters<
    typeof customerRevokeIdentitySessionContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerRevokeIdentitySessionContract.output.encode>[0],
    Parameters<typeof customerRevokeIdentitySessionContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerRevokeIdentitySession =
  (
    access: AccessExecute<'revokeIdentitySessions'>,
  ): ExecuteCustomerRevokeIdentitySession =>
  (
    input: Parameters<
      typeof customerRevokeIdentitySessionContract.input.encode
    >[0],
  ) =>
    access.execute(accessInput(input));

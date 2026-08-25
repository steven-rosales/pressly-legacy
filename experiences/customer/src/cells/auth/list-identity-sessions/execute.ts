import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute } from '../../../auth/model/access.ts';
import type { customerListIdentitySessionsContract } from './contract.ts';

export type ExecuteCustomerListIdentitySessions = (
  input: Parameters<
    typeof customerListIdentitySessionsContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerListIdentitySessionsContract.output.encode>[0],
    Parameters<typeof customerListIdentitySessionsContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerListIdentitySessions =
  (
    access: AccessExecute<'listIdentitySessions'>,
  ): ExecuteCustomerListIdentitySessions =>
  async (
    input: Parameters<
      typeof customerListIdentitySessionsContract.input.encode
    >[0],
  ) => {
    const outcome = await access.execute(input.identityId);
    return outcome.kind === 'success'
      ? {
          kind: 'success',
          value: {
            sessions: outcome.value.sessions.map((session) => ({ ...session })),
          },
        }
      : outcome;
  };

import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerLogoutContract } from './contract.ts';

const accessInput = (
  input: Parameters<typeof customerLogoutContract.input.encode>[0],
): AccessInput<'revokeSession'> => ({
  bearerToken: input.bearerToken,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerLogout = (
  input: Parameters<typeof customerLogoutContract.input.encode>[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerLogoutContract.output.encode>[0],
    Parameters<typeof customerLogoutContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerLogout =
  (access: AccessExecute<'revokeSession'>): ExecuteCustomerLogout =>
  (input: Parameters<typeof customerLogoutContract.input.encode>[0]) =>
    access.execute(accessInput(input));

import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerRemoveMfaContract } from './contract.ts';

const accessInput = (
  input: Parameters<typeof customerRemoveMfaContract.input.encode>[0],
): AccessInput<'removeMfa'> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerRemoveMfa = (
  input: Parameters<typeof customerRemoveMfaContract.input.encode>[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerRemoveMfaContract.output.encode>[0],
    Parameters<typeof customerRemoveMfaContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerRemoveMfa =
  (access: AccessExecute<'removeMfa'>): ExecuteCustomerRemoveMfa =>
  (input: Parameters<typeof customerRemoveMfaContract.input.encode>[0]) =>
    access.execute(accessInput(input));

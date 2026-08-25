import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerRegenerateMfaRecoveryCodesContract } from './contract.ts';

const accessInput = (
  input: Parameters<
    typeof customerRegenerateMfaRecoveryCodesContract.input.encode
  >[0],
): AccessInput<'regenerateMfaRecoveryCodes'> => ({
  identityId: input.identityId,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerRegenerateMfaRecoveryCodes = (
  input: Parameters<
    typeof customerRegenerateMfaRecoveryCodesContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<
      typeof customerRegenerateMfaRecoveryCodesContract.output.encode
    >[0],
    Parameters<
      typeof customerRegenerateMfaRecoveryCodesContract.failure.encode
    >[0]
  >
>;

export const makeExecuteCustomerRegenerateMfaRecoveryCodes =
  (
    access: AccessExecute<'regenerateMfaRecoveryCodes'>,
  ): ExecuteCustomerRegenerateMfaRecoveryCodes =>
  async (
    input: Parameters<
      typeof customerRegenerateMfaRecoveryCodesContract.input.encode
    >[0],
  ) => {
    const outcome = await access.execute(accessInput(input));
    return outcome.kind === 'failure'
      ? outcome
      : {
          kind: 'success',
          value: { recoveryCodes: [...outcome.value.recoveryCodes] },
        };
  };

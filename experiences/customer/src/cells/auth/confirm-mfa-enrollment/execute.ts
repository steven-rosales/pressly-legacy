import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerConfirmMfaEnrollmentContract } from './contract.ts';

const accessInput = (
  input: Parameters<
    typeof customerConfirmMfaEnrollmentContract.input.encode
  >[0],
): AccessInput<'confirmMfaEnrollment'> => ({
  identityId: input.identityId,
  sessionId: input.sessionId,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerConfirmMfaEnrollment = (
  input: Parameters<
    typeof customerConfirmMfaEnrollmentContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerConfirmMfaEnrollmentContract.output.encode>[0],
    Parameters<typeof customerConfirmMfaEnrollmentContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerConfirmMfaEnrollment =
  (
    access: AccessExecute<'confirmMfaEnrollment'>,
  ): ExecuteCustomerConfirmMfaEnrollment =>
  async (
    input: Parameters<
      typeof customerConfirmMfaEnrollmentContract.input.encode
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

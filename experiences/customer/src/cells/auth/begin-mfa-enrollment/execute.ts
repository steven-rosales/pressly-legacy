import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import type { customerBeginMfaEnrollmentContract } from './contract.ts';

const accessInput = (
  input: Parameters<typeof customerBeginMfaEnrollmentContract.input.encode>[0],
): AccessInput<'beginMfaEnrollment'> => ({
  identityId: input.identityId,
  label: input.label,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerBeginMfaEnrollment = (
  input: Parameters<typeof customerBeginMfaEnrollmentContract.input.encode>[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerBeginMfaEnrollmentContract.output.encode>[0],
    Parameters<typeof customerBeginMfaEnrollmentContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerBeginMfaEnrollment =
  (
    access: AccessExecute<'beginMfaEnrollment'>,
  ): ExecuteCustomerBeginMfaEnrollment =>
  (
    input: Parameters<
      typeof customerBeginMfaEnrollmentContract.input.encode
    >[0],
  ) =>
    access.execute(accessInput(input));

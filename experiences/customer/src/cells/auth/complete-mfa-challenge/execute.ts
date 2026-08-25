import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import { projectCustomerPrincipal } from '../../../auth/model/customer-principal.ts';
import type { customerCompleteMfaChallengeContract } from './contract.ts';

const accessInput = (
  input: Parameters<
    typeof customerCompleteMfaChallengeContract.input.encode
  >[0],
): AccessInput<'completeMfaChallenge'> => ({
  challengeToken: input.challengeToken,
  method: input.method,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerCompleteMfaChallenge = (
  input: Parameters<
    typeof customerCompleteMfaChallengeContract.input.encode
  >[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerCompleteMfaChallengeContract.output.encode>[0],
    Parameters<typeof customerCompleteMfaChallengeContract.failure.encode>[0]
  >
>;

export type CustomerCompleteMfaChallengeDependencies = Readonly<{
  completeMfaChallenge: AccessExecute<'completeMfaChallenge'>;
  revokeSession: AccessExecute<'revokeSession'>;
}>;

export const makeExecuteCustomerCompleteMfaChallenge =
  (
    dependencies: CustomerCompleteMfaChallengeDependencies,
  ): ExecuteCustomerCompleteMfaChallenge =>
  async (
    input: Parameters<
      typeof customerCompleteMfaChallengeContract.input.encode
    >[0],
  ) => {
    const outcome = await dependencies.completeMfaChallenge.execute(
      accessInput(input),
    );
    if (outcome.kind === 'failure') return outcome;
    const principal = projectCustomerPrincipal(outcome.value.principal);
    if (principal === null) {
      await dependencies.revokeSession.execute({
        bearerToken: outcome.value.accessToken,
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      });
      return {
        kind: 'failure',
        failure: {
          kind: 'authentication',
          code: 'invalid_mfa_challenge',
          message: 'The MFA challenge is invalid. Sign in again.',
        },
      };
    }
    return {
      kind: 'success',
      value: {
        accessToken: outcome.value.accessToken,
        expiresAt: outcome.value.expiresAt,
        principal,
      },
    };
  };

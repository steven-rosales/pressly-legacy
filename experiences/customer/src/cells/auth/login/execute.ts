import type { CellOutcome } from '@pressly/cells';
import type { AccessExecute, AccessInput } from '../../../auth/model/access.ts';
import { projectCustomerPrincipal } from '../../../auth/model/customer-principal.ts';
import { type LoginInput } from '../../../auth/model/schemas.ts';
import type { customerLoginContract } from './contract.ts';

const accessInput = (input: LoginInput): AccessInput<'login'> => ({
  email: input.email,
  password: input.password,
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
});

export type ExecuteCustomerLogin = (
  input: Parameters<typeof customerLoginContract.input.encode>[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerLoginContract.output.encode>[0],
    Parameters<typeof customerLoginContract.failure.encode>[0]
  >
>;

export type CustomerLoginDependencies = Readonly<{
  login: AccessExecute<'login'>;
  revokeSession: AccessExecute<'revokeSession'>;
}>;

const invalidCredentials = () => ({
  kind: 'failure' as const,
  failure: {
    kind: 'authentication' as const,
    code: 'invalid_credentials' as const,
    message: 'Invalid email or password.',
  },
});

export const makeExecuteCustomerLogin =
  (dependencies: CustomerLoginDependencies): ExecuteCustomerLogin =>
  async (input: Parameters<typeof customerLoginContract.input.encode>[0]) => {
    const outcome = await dependencies.login.execute(accessInput(input));
    if (outcome.kind === 'failure') return outcome;
    const principal = projectCustomerPrincipal(outcome.value.principal);
    if (principal === null) {
      if (!('status' in outcome.value))
        await dependencies.revokeSession.execute({
          bearerToken: outcome.value.accessToken,
          ...(input.requestId === undefined
            ? {}
            : { requestId: input.requestId }),
        });
      return invalidCredentials();
    }
    if ('status' in outcome.value)
      return {
        kind: 'success',
        value: { ...outcome.value, principal },
      };
    return {
      kind: 'success',
      value: {
        accessToken: outcome.value.accessToken,
        expiresAt: outcome.value.expiresAt,
        principal,
      },
    };
  };

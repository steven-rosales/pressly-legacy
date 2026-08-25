import type { CellOutcome } from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type { AccessExecute } from '../../../auth/model/access.ts';
import { projectCustomerPrincipal } from '../../../auth/model/customer-principal.ts';
import { type SessionOutput } from '../../../auth/model/schemas.ts';
import type { customerLoadSessionContract } from './contract.ts';

export type ExecuteCustomerLoadSession = (
  input: Parameters<typeof customerLoadSessionContract.input.encode>[0],
) => Promise<
  CellOutcome<
    Parameters<typeof customerLoadSessionContract.output.encode>[0],
    Parameters<typeof customerLoadSessionContract.failure.encode>[0]
  >
>;

export const makeExecuteCustomerLoadSession =
  (access: AccessExecute<'loadSession'>): ExecuteCustomerLoadSession =>
  async (
    input: Parameters<typeof customerLoadSessionContract.input.encode>[0],
  ) => {
    const outcome = await access.execute(input);
    if (outcome.kind === 'failure') return outcome;
    const principal = projectCustomerPrincipal(outcome.value.principal);
    if (principal === null)
      return {
        kind: 'failure',
        failure: {
          kind: 'authentication',
          code: 'invalid_session',
          message: 'Authentication is required.',
        },
      };
    const expiresAt = outcome.value.principal.sessionExpiresAt;
    if (expiresAt === undefined)
      throw invariantViolationError({
        code: 'loaded_session_missing_expiry',
        message: 'Loaded session principal is missing session expiry.',
        safeMessage: 'Session could not be loaded.',
      });

    const value: SessionOutput = {
      principal,
      expiresAt,
    };
    return { kind: 'success', value };
  };

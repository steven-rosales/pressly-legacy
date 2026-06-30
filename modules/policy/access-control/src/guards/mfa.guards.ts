import type { RequestHandler } from 'express';
import type { AccessControlAuthorize } from './pricing.guards.ts';
import { readAuthLocals } from './auth-locals.ts';
import { makeMfaPolicies } from '../policies/mfa.policy.ts';

export type MfaAccessControl = Readonly<{
  authenticate: RequestHandler;
  enroll: RequestHandler;
  manage: RequestHandler;
}>;

export const makeMfaAccessControl = (input: {
  authenticate: RequestHandler;
  authorize: AccessControlAuthorize;
  freshSessionMaxAgeMinutes: number;
}): MfaAccessControl => {
  const policies = makeMfaPolicies({
    freshSessionMaxAgeMinutes: input.freshSessionMaxAgeMinutes,
  });

  const readResource = (
    _req: unknown,
    res: Parameters<typeof readAuthLocals>[0],
  ) => {
    const principal = readAuthLocals(res).principal;

    return {
      kind: 'auth.identity' as const,
      id: principal.identityId,
      scope: { kind: 'global' as const, id: '*' as const },
      attributes: {},
    };
  };

  return {
    authenticate: input.authenticate,

    enroll: input.authorize({
      action: 'auth:mfa:enroll',
      policies,
      readResource,
    }),

    manage: input.authorize({
      action: 'auth:mfa:manage',
      policies,
      readResource,
    }),
  };
};

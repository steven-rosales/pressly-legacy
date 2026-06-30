import type { RequestHandler, Response } from 'express';
import type { AccessControlAuthorize } from './pricing.guards.ts';
import { readAuthLocals } from './auth-locals.ts';
import { makeAuthSessionPolicies } from '../policies/auth-sessions.policy.ts';
import { authIdentityResourceFromRequest } from '../resources/auth.resources.ts';

export type AuthSessionAccessControl = Readonly<{
  authenticate: RequestHandler;
  readSessions: RequestHandler;
  revokeSessions: RequestHandler;
  readPrincipalIdentityId: (res: Response) => string;
}>;

export const makeAuthSessionAccessControl = (input: {
  authenticate: RequestHandler;
  authorize: AccessControlAuthorize;
  freshSessionMaxAgeMinutes: number;
}): AuthSessionAccessControl => {
  const policies = makeAuthSessionPolicies({
    freshSessionMaxAgeMinutes: input.freshSessionMaxAgeMinutes,
  });

  return {
    authenticate: input.authenticate,
    readSessions: input.authorize({
      action: 'auth:session:read',
      policies,
      readResource: authIdentityResourceFromRequest,
    }),
    revokeSessions: input.authorize({
      action: 'auth:session:revoke',
      policies,
      readResource: authIdentityResourceFromRequest,
    }),
    readPrincipalIdentityId: (res) => readAuthLocals(res).principal.identityId,
  };
};

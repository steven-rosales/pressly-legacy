import type { Request, RequestHandler, Response } from 'express';
import type { AccessControlAuthPort } from '../http/auth.port.ts';
import { makeAuthSessionPolicies } from './auth-sessions.policy.ts';
import { authIdentityResource } from '../identity/auth-identity.resource.ts';

export type AuthSessionAccessControl = Readonly<{
  authenticate: RequestHandler;
  readSessions: RequestHandler;
  revokeSessions: RequestHandler;
  readPrincipalIdentityId: (res: Response) => string;
}>;

export const makeAuthSessionAccessControl = (input: {
  auth: AccessControlAuthPort;
  freshSessionMaxAgeMinutes: number;
}): AuthSessionAccessControl => {
  const policies = makeAuthSessionPolicies({
    freshSessionMaxAgeMinutes: input.freshSessionMaxAgeMinutes,
  });

  const readResource = (req: Request) => {
    const identityId = req.params['identityId'];

    return authIdentityResource(
      Array.isArray(identityId) ? (identityId[0] ?? '') : (identityId ?? ''),
    );
  };

  return {
    authenticate: input.auth.authenticate,
    readSessions: input.auth.authorize({
      action: 'auth:session:read',
      policies,
      readResource,
    }),
    revokeSessions: input.auth.authorize({
      action: 'auth:session:revoke',
      policies,
      readResource,
    }),
    readPrincipalIdentityId: (res) => input.auth.readPrincipal(res).identityId,
  };
};

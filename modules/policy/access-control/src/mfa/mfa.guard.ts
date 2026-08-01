import type { RequestHandler, Response } from 'express';
import type { AccessControlAuthPort } from '../http/auth.port.ts';
import { authIdentityResource } from '../identity/auth-identity.resource.ts';
import { makeMfaPolicies } from './mfa.policy.ts';

export type MfaAccessControl = Readonly<{
  authenticate: RequestHandler;
  enroll: RequestHandler;
  manage: RequestHandler;
}>;

export const makeMfaAccessControl = (input: {
  auth: AccessControlAuthPort;
  freshSessionMaxAgeMinutes: number;
}): MfaAccessControl => {
  const policies = makeMfaPolicies({
    freshSessionMaxAgeMinutes: input.freshSessionMaxAgeMinutes,
  });

  const readResource = (_req: unknown, res: Response) =>
    authIdentityResource(input.auth.readPrincipal(res).identityId);

  return {
    authenticate: input.auth.authenticate,

    enroll: input.auth.authorize({
      action: 'auth:mfa:enroll',
      policies,
      readResource,
    }),

    manage: input.auth.authorize({
      action: 'auth:mfa:manage',
      policies,
      readResource,
    }),
  };
};

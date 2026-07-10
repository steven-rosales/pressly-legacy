import {
  identitySessionParamsSchema,
  identitySessionsParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';
import {
  makeListIdentitySessionsController,
  makeRevokeIdentitySessionsController,
  type ReadPrincipalIdentityId,
} from './administer-sessions.controller.ts';

export type SessionAdministrationSecurity = Readonly<{
  authenticate: RequestHandler;
  readSessions: RequestHandler;
  revokeSessions: RequestHandler;
  readPrincipalIdentityId: ReadPrincipalIdentityId;
}>;

export const makeSessionAdministrationRouter = (input: {
  listIdentitySessions: ListIdentitySessions;
  revokeIdentitySessions: RevokeIdentitySessions;
  security: SessionAdministrationSecurity;
}): Router => {
  const router = Router();
  const validateIdentity = validateRequest({
    params: identitySessionsParamsSchema,
  });
  const validateSession = validateRequest({
    params: identitySessionParamsSchema,
  });

  router.get(
    '/identities/:identityId/sessions',
    validateIdentity,
    input.security.authenticate,
    input.security.readSessions,
    makeListIdentitySessionsController(input.listIdentitySessions),
  );
  router.post(
    '/identities/:identityId/sessions/revoke-all',
    validateIdentity,
    input.security.authenticate,
    input.security.revokeSessions,
    makeRevokeIdentitySessionsController({
      revokeIdentitySessions: input.revokeIdentitySessions,
      readPrincipalIdentityId: input.security.readPrincipalIdentityId,
      mode: 'all',
    }),
  );
  router.post(
    '/identities/:identityId/sessions/:sessionId/revoke',
    validateSession,
    input.security.authenticate,
    input.security.revokeSessions,
    makeRevokeIdentitySessionsController({
      revokeIdentitySessions: input.revokeIdentitySessions,
      readPrincipalIdentityId: input.security.readPrincipalIdentityId,
      mode: 'selected',
    }),
  );

  return router;
};

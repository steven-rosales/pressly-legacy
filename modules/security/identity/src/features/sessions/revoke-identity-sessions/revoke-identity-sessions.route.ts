import { Router, type RequestHandler } from 'express';
import {
  makeRevokeAllIdentitySessionsController,
  makeRevokeIdentitySessionController,
  revokeAllIdentitySessionsBoundary,
  revokeIdentitySessionBoundary,
  type ReadPrincipalIdentityId,
} from './revoke-identity-sessions.controller.ts';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';

export const makeRevokeIdentitySessionsRouter = (input: {
  revokeIdentitySessions: RevokeIdentitySessions;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipalIdentityId: ReadPrincipalIdentityId;
}): Router => {
  const router = Router();
  router.post(
    '/identities/:identityId/sessions/revoke-all',
    revokeAllIdentitySessionsBoundary.validate,
    input.authenticate,
    input.authorize,
    makeRevokeAllIdentitySessionsController(input),
  );
  router.post(
    '/identities/:identityId/sessions/:sessionId/revoke',
    revokeIdentitySessionBoundary.validate,
    input.authenticate,
    input.authorize,
    makeRevokeIdentitySessionController(input),
  );
  return router;
};

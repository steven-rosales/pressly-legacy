import { Router, type RequestHandler } from 'express';
import {
  makeRevokeAllIdentitySessionsController,
  makeRevokeIdentitySessionController,
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
  const revokeAllController = makeRevokeAllIdentitySessionsController(input);
  const revokeOneController = makeRevokeIdentitySessionController(input);
  router.post(
    '/identities/:identityId/sessions/revoke-all',
    revokeAllController.validate,
    input.authenticate,
    input.authorize,
    revokeAllController.handle,
  );
  router.post(
    '/identities/:identityId/sessions/:sessionId/revoke',
    revokeOneController.validate,
    input.authenticate,
    input.authorize,
    revokeOneController.handle,
  );
  return router;
};

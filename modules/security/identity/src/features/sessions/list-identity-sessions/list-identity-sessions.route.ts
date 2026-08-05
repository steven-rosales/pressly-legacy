import { Router, type RequestHandler } from 'express';
import { makeListIdentitySessionsController } from './list-identity-sessions.controller.ts';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';

export const makeListIdentitySessionsRouter = (input: {
  listIdentitySessions: ListIdentitySessions;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeListIdentitySessionsController(
    input.listIdentitySessions,
  );
  router.get(
    '/identities/:identityId/sessions',
    controller.validate,
    input.authenticate,
    input.authorize,
    controller.handle,
  );
  return router;
};

import { Router, type RequestHandler } from 'express';
import {
  listIdentitySessionsBoundary,
  makeListIdentitySessionsController,
} from './list-identity-sessions.controller.ts';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';

export const makeListIdentitySessionsRouter = (input: {
  listIdentitySessions: ListIdentitySessions;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/identities/:identityId/sessions',
    listIdentitySessionsBoundary.validate,
    input.authenticate,
    input.authorize,
    makeListIdentitySessionsController(input.listIdentitySessions),
  );
  return router;
};

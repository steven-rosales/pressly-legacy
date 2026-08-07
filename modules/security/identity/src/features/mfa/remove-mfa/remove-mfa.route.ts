import { Router, type RequestHandler } from 'express';
import { makeRemoveMfaController } from './remove-mfa.controller.ts';
import type { RemoveMfa } from './remove-mfa.usecase.ts';

export const makeRemoveMfaRouter = (input: {
  removeMfa: RemoveMfa;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.post(
    '/remove',
    input.authenticate,
    input.authorize,
    makeRemoveMfaController(input.removeMfa),
  );
  return router;
};

import { Router } from 'express';
import type { RevokeSession } from '../../../features/revoke-session/revoke-session.usecase.ts';
import { makeRevokeSessionController } from './revoke-session.controller.ts';

export const makeRevokeSessionRouter = (input: {
  revokeSession: RevokeSession;
}): Router => {
  const router = Router();
  const revokeSessionController = makeRevokeSessionController(
    input.revokeSession,
  );

  router.post('/', revokeSessionController);

  return router;
};

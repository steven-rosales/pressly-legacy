import { Router } from 'express';
import { makeCompleteMfaChallengeController } from './complete-mfa-challenge.controller.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';

export const makeCompleteMfaChallengeRouter = (
  completeMfaChallenge: CompleteMfaChallenge,
): Router => {
  const router = Router();
  const controller = makeCompleteMfaChallengeController(completeMfaChallenge);
  router.post('/challenge', controller.validate, controller.handle);
  return router;
};

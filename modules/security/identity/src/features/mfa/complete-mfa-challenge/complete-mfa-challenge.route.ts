import { Router } from 'express';
import {
  completeMfaChallengeBoundary,
  makeCompleteMfaChallengeController,
} from './complete-mfa-challenge.controller.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';

export const makeCompleteMfaChallengeRouter = (
  completeMfaChallenge: CompleteMfaChallenge,
): Router => {
  const router = Router();
  router.post(
    '/challenge',
    completeMfaChallengeBoundary.validate,
    makeCompleteMfaChallengeController(completeMfaChallenge),
  );
  return router;
};

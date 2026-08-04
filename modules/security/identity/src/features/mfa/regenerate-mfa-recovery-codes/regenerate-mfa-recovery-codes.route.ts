import { Router, type RequestHandler } from 'express';
import { makeRegenerateMfaRecoveryCodesController } from './regenerate-mfa-recovery-codes.controller.ts';
import type { RegenerateMfaRecoveryCodes } from './regenerate-mfa-recovery-codes.usecase.ts';

export const makeRegenerateMfaRecoveryCodesRouter = (input: {
  regenerateMfaRecoveryCodes: RegenerateMfaRecoveryCodes;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.post(
    '/recovery-codes/regenerate',
    input.authenticate,
    input.authorize,
    makeRegenerateMfaRecoveryCodesController(input.regenerateMfaRecoveryCodes),
  );
  return router;
};

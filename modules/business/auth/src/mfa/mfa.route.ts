import {
  completeMfaChallengeRequestSchema,
  confirmMfaEnrollmentRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';
import type {
  BeginMfaEnrollment,
  ConfirmMfaEnrollment,
} from './enroll-mfa.usecase.ts';
import type {
  RegenerateMfaRecoveryCodes,
  RemoveMfa,
} from './manage-mfa.usecase.ts';
import {
  makeBeginMfaEnrollmentController,
  makeCompleteMfaChallengeController,
  makeConfirmMfaEnrollmentController,
  makeRegenerateRecoveryCodesController,
  makeRemoveMfaController,
} from './mfa.controller.ts';

export type MfaRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  enroll: RequestHandler;
  manage: RequestHandler;
}>;

export const makeMfaChallengeRouter = (
  completeMfaChallenge: CompleteMfaChallenge,
): Router => {
  const router = Router();
  router.post(
    '/challenge',
    validateRequest({ body: completeMfaChallengeRequestSchema }),
    makeCompleteMfaChallengeController(completeMfaChallenge),
  );
  return router;
};

export const makeMfaAdministrationRouter = (input: {
  beginMfaEnrollment: BeginMfaEnrollment;
  confirmMfaEnrollment: ConfirmMfaEnrollment;
  regenerateMfaRecoveryCodes: RegenerateMfaRecoveryCodes;
  removeMfa: RemoveMfa;
  security: MfaRouteSecurity;
}): Router => {
  const router = Router();
  const enrollSecurity = [input.security.authenticate, input.security.enroll];
  const manageSecurity = [input.security.authenticate, input.security.manage];

  router.post(
    '/enrollment',
    ...enrollSecurity,
    makeBeginMfaEnrollmentController(input.beginMfaEnrollment),
  );
  router.post(
    '/enrollment/confirm',
    validateRequest({ body: confirmMfaEnrollmentRequestSchema }),
    ...enrollSecurity,
    makeConfirmMfaEnrollmentController(input.confirmMfaEnrollment),
  );
  router.post(
    '/recovery-codes/regenerate',
    ...manageSecurity,
    makeRegenerateRecoveryCodesController(input.regenerateMfaRecoveryCodes),
  );
  router.post(
    '/remove',
    ...manageSecurity,
    makeRemoveMfaController(input.removeMfa),
  );

  return router;
};

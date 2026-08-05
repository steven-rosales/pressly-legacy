import { Router, type RequestHandler } from 'express';
import { makeConfirmMfaEnrollmentController } from './confirm-mfa-enrollment.controller.ts';
import type { ConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';

export const makeConfirmMfaEnrollmentRouter = (input: {
  confirmMfaEnrollment: ConfirmMfaEnrollment;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeConfirmMfaEnrollmentController(
    input.confirmMfaEnrollment,
  );
  router.post(
    '/enrollment/confirm',
    controller.validate,
    input.authenticate,
    input.authorize,
    controller.handle,
  );
  return router;
};

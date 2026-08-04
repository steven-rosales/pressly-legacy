import { Router, type RequestHandler } from 'express';
import {
  confirmMfaEnrollmentBoundary,
  makeConfirmMfaEnrollmentController,
} from './confirm-mfa-enrollment.controller.ts';
import type { ConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';

export const makeConfirmMfaEnrollmentRouter = (input: {
  confirmMfaEnrollment: ConfirmMfaEnrollment;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.post(
    '/enrollment/confirm',
    confirmMfaEnrollmentBoundary.validate,
    input.authenticate,
    input.authorize,
    makeConfirmMfaEnrollmentController(input.confirmMfaEnrollment),
  );
  return router;
};

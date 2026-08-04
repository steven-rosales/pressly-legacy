import { Router, type RequestHandler } from 'express';
import { makeBeginMfaEnrollmentController } from './begin-mfa-enrollment.controller.ts';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';

export const makeBeginMfaEnrollmentRouter = (input: {
  beginMfaEnrollment: BeginMfaEnrollment;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.post(
    '/enrollment',
    input.authenticate,
    input.authorize,
    makeBeginMfaEnrollmentController(input.beginMfaEnrollment),
  );
  return router;
};

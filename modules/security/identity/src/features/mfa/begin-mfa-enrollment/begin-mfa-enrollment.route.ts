import { Router, type RequestHandler } from 'express';
import { makeBeginMfaEnrollmentController } from './begin-mfa-enrollment.controller.ts';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';

type MakeBeginMfaEnrollmentRouterInput = {
  beginMfaEnrollment: BeginMfaEnrollment;
  authenticate: RequestHandler;
  authorize: RequestHandler;
};

export const makeBeginMfaEnrollmentRouter = (
  input: MakeBeginMfaEnrollmentRouterInput,
): Router => {
  const router = Router();

  router.post(
    '/enrollment',
    input.authenticate,
    input.authorize,
    makeBeginMfaEnrollmentController(input.beginMfaEnrollment),
  );

  return router;
};

import {
  mfaEnrollmentResultSchema,
  type MfaEnrollmentResult,
} from '@pressly/contracts/auth';
import type { MfaEnrollment } from './begin-mfa-enrollment.model.ts';

export const beginMfaEnrollmentContract = Object.freeze({
  response: mfaEnrollmentResultSchema,
});

export const toMfaEnrollmentResult = (
  enrollment: MfaEnrollment,
): MfaEnrollmentResult => ({
  secret: enrollment.secret,
  enrollmentUri: enrollment.enrollmentUri,
});

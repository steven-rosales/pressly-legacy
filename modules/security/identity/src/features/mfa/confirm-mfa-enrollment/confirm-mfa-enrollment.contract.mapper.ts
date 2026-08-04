import {
  confirmMfaEnrollmentRequestSchema,
  mfaRecoveryCodesResultSchema,
  type MfaRecoveryCodesResult,
} from '@pressly/contracts/auth';
import type { MfaRecoveryCodes } from '../../../foundations/language/mfa/mfa.model.ts';

export const confirmMfaEnrollmentContract = Object.freeze({
  request: confirmMfaEnrollmentRequestSchema,
  response: mfaRecoveryCodesResultSchema,
});

export const toMfaRecoveryCodesResult = (
  recovery: MfaRecoveryCodes,
): MfaRecoveryCodesResult => ({ recoveryCodes: [...recovery.recoveryCodes] });

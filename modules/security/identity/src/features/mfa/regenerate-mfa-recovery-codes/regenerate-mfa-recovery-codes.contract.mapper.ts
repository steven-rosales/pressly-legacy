import {
  mfaRecoveryCodesResultSchema,
  type MfaRecoveryCodesResult,
} from '@pressly/contracts/auth';
import type { MfaRecoveryCodes } from '../../../foundations/language/mfa/mfa.model.ts';

export const regenerateMfaRecoveryCodesContract = Object.freeze({
  response: mfaRecoveryCodesResultSchema,
});

export const toRegeneratedMfaRecoveryCodesResult = (
  recovery: MfaRecoveryCodes,
): MfaRecoveryCodesResult => ({ recoveryCodes: [...recovery.recoveryCodes] });

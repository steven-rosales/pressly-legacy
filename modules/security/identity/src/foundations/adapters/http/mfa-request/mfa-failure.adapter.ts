import { authError, conflictError } from '@pressly/errors/factories';
import type { MfaFailure } from '../../../language/mfa/mfa.failure.ts';

export const mfaFailureToAppError = (failure: MfaFailure) =>
  failure.kind === 'authentication'
    ? authError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      })
    : conflictError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      });

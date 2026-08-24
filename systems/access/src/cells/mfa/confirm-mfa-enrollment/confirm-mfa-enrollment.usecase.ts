import type { RecoveryCodeService } from '@pressly/auth-platform/recovery-codes';
import type { SecretBox } from '@pressly/auth-platform/secret-box';
import type { TotpAuthenticator } from '@pressly/auth-platform/totp';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import type { Clock } from '@pressly/time';
import { mfaFailure } from '../../../model/language/mfa/mfa.failure.ts';
import type { MfaRecoveryCodes } from '../../../model/language/mfa/mfa.model.ts';
import type { ConfirmMfaEnrollmentCommand } from './confirm-mfa-enrollment.model.ts';
import type { ConfirmMfaEnrollmentStore } from './confirm-mfa-enrollment.port.ts';

export type ConfirmMfaEnrollmentFailure =
  | Readonly<{
      kind: 'authentication';
      code: 'invalid_mfa_code';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'mfa_enrollment_missing';
      message: string;
    }>;

export type ConfirmMfaEnrollment = (
  command: ConfirmMfaEnrollmentCommand,
) => Promise<Result<MfaRecoveryCodes, ConfirmMfaEnrollmentFailure>>;

export const makeConfirmMfaEnrollment =
  (deps: {
    store: ConfirmMfaEnrollmentStore;
    totp: TotpAuthenticator;
    secretBox: SecretBox;
    recoveryCodes: RecoveryCodeService;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): ConfirmMfaEnrollment =>
  async ({ identityId, sessionId, code, requestId }) => {
    const credential = await deps.store.findCredential(identityId);
    if (credential === undefined || credential.status !== 'pending')
      return result.err(mfaFailure.enrollmentMissing());

    const now = deps.clock.now();
    const verification = deps.totp.verify({
      secret: deps.secretBox.decrypt(credential.encryptedSecret),
      token: code,
      now,
    });
    if (!verification.valid || verification.counter === undefined)
      return result.err(mfaFailure.invalidCode());

    const recoveryCodes = deps.recoveryCodes.generate(10);
    const confirmed = await deps.store.confirmEnrollment({
      identityId,
      sessionId,
      counter: verification.counter,
      recoveryCodeHashes: recoveryCodes.map(deps.recoveryCodes.hash),
      now,
    });
    if (!confirmed) return result.err(mfaFailure.invalidCode());

    (deps.securityEvents ?? nullSecurityEventSink).emit({
      name: 'mfa.enrolled',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(requestId === undefined ? {} : { requestId }),
      principalId: identityId,
      sessionId,
      resourceType: 'auth.identity',
      resourceId: identityId,
    });

    return result.ok({ recoveryCodes: [...recoveryCodes] });
  };

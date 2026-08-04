import type { SecretBox, TotpAuthenticator } from '@pressly/auth/credentials';
import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { SecurityEventSink } from '@pressly/logging';
import {
  mfaFailure,
  type MfaFailure,
} from '../../../foundations/language/mfa/mfa.failure.ts';
import type { MfaEnrollmentStore } from '../../../foundations/ports/mfa-store/mfa-enrollment-store.port.ts';
import type {
  BeginMfaEnrollmentCommand,
  MfaEnrollment,
} from './begin-mfa-enrollment.model.ts';

export type BeginMfaEnrollment = (
  command: BeginMfaEnrollmentCommand,
) => Promise<Result<MfaEnrollment, MfaFailure>>;

export const makeBeginMfaEnrollment =
  (deps: {
    store: MfaEnrollmentStore;
    totp: TotpAuthenticator;
    secretBox: SecretBox;
    clock: Clock;
    issuer: string;
    securityEvents?: SecurityEventSink;
  }): BeginMfaEnrollment =>
  async ({ identityId, label }) => {
    const secret = deps.totp.generateSecret();
    const started = await deps.store.beginEnrollment({
      identityId,
      encryptedSecret: deps.secretBox.encrypt(secret),
      now: deps.clock.now(),
    });
    if (started === 'already_enabled')
      return result.err(mfaFailure.alreadyEnabled());

    return result.ok({
      secret,
      enrollmentUri: deps.totp.enrollmentUri({
        secret,
        issuer: deps.issuer,
        label,
      }),
    });
  };

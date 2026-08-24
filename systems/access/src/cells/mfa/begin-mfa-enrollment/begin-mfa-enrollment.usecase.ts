import type { SecretBox } from '@pressly/auth-platform/secret-box';
import type { TotpAuthenticator } from '@pressly/auth-platform/totp';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import type { SecurityEventSink } from '@pressly/logging';
import { mfaFailure } from '../../../model/language/mfa/mfa.failure.ts';
import type {
  BeginMfaEnrollmentCommand,
  MfaEnrollment,
} from './begin-mfa-enrollment.model.ts';
import type { BeginMfaEnrollmentStore } from './begin-mfa-enrollment.port.ts';

type MakeBeginMfaEnrollmentDeps = {
  store: BeginMfaEnrollmentStore;
  totp: TotpAuthenticator;
  secretBox: SecretBox;
  clock: Clock;
  issuer: string;
  securityEvents?: SecurityEventSink;
};

export type BeginMfaEnrollmentFailure = Readonly<{
  kind: 'conflict';
  code: 'mfa_already_enabled';
  message: string;
}>;

export type BeginMfaEnrollment = (
  command: BeginMfaEnrollmentCommand,
) => Promise<Result<MfaEnrollment, BeginMfaEnrollmentFailure>>;

export const makeBeginMfaEnrollment =
  (deps: MakeBeginMfaEnrollmentDeps): BeginMfaEnrollment =>
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

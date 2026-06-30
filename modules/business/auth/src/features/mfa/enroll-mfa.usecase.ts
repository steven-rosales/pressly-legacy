import type {
  MfaEnrollmentResult,
  MfaRecoveryCodesResult,
} from '@pressly/contracts';
import type {
  RecoveryCodeService,
  SecretBox,
  TotpAuthenticator,
} from '@pressly/auth/credentials';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import {
  invalidMfaCode,
  mfaAlreadyEnabled,
  mfaEnrollmentMissing,
} from './mfa.error.ts';
import type { Clock, MfaStore } from './mfa.port.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';

export type BeginMfaEnrollment = (command: {
  identityId: string;
  label: string;
  requestId?: string;
}) => Promise<Result<MfaEnrollmentResult, AppError>>;

export type ConfirmMfaEnrollment = (command: {
  identityId: string;
  sessionId: string;
  code: string;
  requestId?: string;
}) => Promise<Result<MfaRecoveryCodesResult, AppError>>;

export const makeBeginMfaEnrollment =
  (deps: {
    store: MfaStore;
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
    if (result.isErr(started)) return started;
    if (started.value === 'already_enabled')
      return result.err(mfaAlreadyEnabled());

    return result.ok({
      secret,
      enrollmentUri: deps.totp.enrollmentUri({
        secret,
        issuer: deps.issuer,
        label,
      }),
    });
  };

export const makeConfirmMfaEnrollment =
  (deps: {
    store: MfaStore;
    totp: TotpAuthenticator;
    secretBox: SecretBox;
    recoveryCodes: RecoveryCodeService;
    clock: Clock;
    securityEvents?: SecurityEventSink;
  }): ConfirmMfaEnrollment =>
  async ({ identityId, sessionId, code, requestId }) => {
    const credential = await deps.store.findCredential(identityId);
    if (result.isErr(credential)) return credential;
    if (credential.value === undefined || credential.value.status !== 'pending')
      return result.err(mfaEnrollmentMissing());

    const now = deps.clock.now();
    const verification = deps.totp.verify({
      secret: deps.secretBox.decrypt(credential.value.encryptedSecret),
      token: code,
      now,
    });
    if (!verification.valid || verification.counter === undefined)
      return result.err(invalidMfaCode());

    const recoveryCodes = deps.recoveryCodes.generate(10);
    const confirmed = await deps.store.confirmEnrollment({
      identityId,
      sessionId,
      counter: verification.counter,
      recoveryCodeHashes: recoveryCodes.map(deps.recoveryCodes.hash),
      now,
    });
    if (result.isErr(confirmed)) return confirmed;
    if (!confirmed.value) return result.err(invalidMfaCode());

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

import type { RecoveryCodeService } from '@pressly/auth-platform/recovery-codes';
import type { SecretBox } from '@pressly/auth-platform/secret-box';
import type { TotpAuthenticator } from '@pressly/auth-platform/totp';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { Clock } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { mfaFailure } from '../../../model/language/mfa/mfa.failure.ts';
import type { AuthenticatedSession } from '../../../model/language/authentication-session/authenticated-session.model.ts';
import type { CompleteMfaChallengeCommand } from './complete-mfa-challenge.model.ts';
import type {
  CompleteMfaChallengeStore,
  MfaChallengeTokenService,
} from './complete-mfa-challenge.port.ts';

type MakeCompleteMfaChallengeDeps = {
  store: CompleteMfaChallengeStore;
  tokenService: MfaChallengeTokenService;
  totp: TotpAuthenticator;
  secretBox: SecretBox;
  recoveryCodes: RecoveryCodeService;
  clock: Clock;
  sessionTtlMinutes: number;
  maxAttempts: number;
  securityEvents?: SecurityEventSink;
};

export type CompleteMfaChallengeFailure = Readonly<{
  kind: 'authentication';
  code: 'invalid_mfa_challenge' | 'expired_mfa_challenge' | 'invalid_mfa_code';
  message: string;
}>;

export type CompleteMfaChallenge = (
  command: CompleteMfaChallengeCommand,
) => Promise<Result<AuthenticatedSession, CompleteMfaChallengeFailure>>;

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

export const makeCompleteMfaChallenge =
  (deps: MakeCompleteMfaChallengeDeps): CompleteMfaChallenge =>
  async (command) => {
    const securityEvents = deps.securityEvents ?? nullSecurityEventSink;
    const now = deps.clock.now();
    const reservation = await deps.store.reserveChallengeAttempt({
      tokenHash: deps.tokenService.hash(command.challengeToken),
      now,
      maxAttempts: deps.maxAttempts,
    });
    if (
      reservation.status === 'invalid' ||
      reservation.status === 'exhausted'
    ) {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        reason:
          reservation.status === 'exhausted'
            ? 'challenge_attempts_exhausted'
            : 'invalid_or_consumed_challenge',
      });
      return result.err(mfaFailure.invalidChallenge());
    }
    if (reservation.status === 'expired') {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        reason: 'expired_challenge',
      });
      return result.err(mfaFailure.expiredChallenge());
    }
    const found = reservation.challenge;

    const accessToken = deps.tokenService.issue();
    const expiresAt = addMinutes(now, deps.sessionTtlMinutes);
    const baseCompletion = {
      challengeId: found.challengeId,
      identityId: found.identityId,
      sessionTokenHash: deps.tokenService.hash(accessToken),
      issuedAt: now,
      expiresAt,
    };
    const completed =
      command.method === 'totp'
        ? await completeTotp(deps, command.code, found, baseCompletion, now)
        : await deps.store.completeRecoveryChallenge({
            ...baseCompletion,
            recoveryCodeHash: deps.recoveryCodes.hash(command.code),
          });

    if (completed.status === 'rejected') {
      await deps.store.rejectReservedChallengeAttempt({
        challengeId: found.challengeId,
        identityId: found.identityId,
        now,
        maxAttempts: deps.maxAttempts,
      });
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: found.identityId,
        reason: 'invalid_or_replayed_code',
      });
      return result.err(mfaFailure.invalidCode());
    }

    securityEvents.emit({
      name:
        command.method === 'recovery'
          ? 'mfa.recovery_used'
          : 'authentication.login_succeeded',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(command.requestId === undefined
        ? {}
        : { requestId: command.requestId }),
      principalId: found.identityId,
      resourceType: 'auth.identity',
      resourceId: found.identityId,
    });

    return result.ok({
      accessToken,
      expiresAt: completed.expiresAt,
      principal: {
        identityId: found.identityId,
        displayName: found.displayName,
        ...(found.email === undefined ? {} : { email: found.email }),
        ...(found.customerId === undefined
          ? {}
          : { audience: 'customer', customerId: found.customerId }),
        roles: [...found.roles],
      },
    });
  };

const completeTotp = async (
  deps: Parameters<typeof makeCompleteMfaChallenge>[0],
  code: string,
  challenge: {
    challengeId: string;
    identityId: string;
    encryptedSecret: string;
    lastUsedCounter: number | null;
  },
  completion: {
    challengeId: string;
    identityId: string;
    sessionTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  },
  now: Date,
) => {
  const verification = deps.totp.verify({
    secret: deps.secretBox.decrypt(challenge.encryptedSecret),
    token: code,
    now,
  });
  if (
    !verification.valid ||
    verification.counter === undefined ||
    (challenge.lastUsedCounter !== null &&
      verification.counter <= challenge.lastUsedCounter)
  )
    return { status: 'rejected' } as const;

  return deps.store.completeTotpChallenge({
    ...completion,
    counter: verification.counter,
  });
};

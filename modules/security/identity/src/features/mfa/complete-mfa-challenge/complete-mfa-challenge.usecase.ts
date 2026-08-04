import type {
  RecoveryCodeService,
  SecretBox,
  TotpAuthenticator,
} from '@pressly/auth/credentials';
import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import {
  mfaFailure,
  type MfaFailure,
} from '../../../foundations/language/mfa/mfa.failure.ts';
import type {
  CompleteMfaChallengeStore,
  TokenService,
} from '../../../foundations/ports/mfa-store/mfa-challenge-store.port.ts';
import type { AuthenticatedSession } from '../../../foundations/language/authentication-session/authenticated-session.model.ts';
import type { CompleteMfaChallengeCommand } from './complete-mfa-challenge.model.ts';

export type CompleteMfaChallenge = (
  command: CompleteMfaChallengeCommand,
) => Promise<Result<AuthenticatedSession, MfaFailure>>;

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

export const makeCompleteMfaChallenge =
  (deps: {
    store: CompleteMfaChallengeStore;
    tokenService: TokenService;
    totp: TotpAuthenticator;
    secretBox: SecretBox;
    recoveryCodes: RecoveryCodeService;
    clock: Clock;
    sessionTtlMinutes: number;
    securityEvents?: SecurityEventSink;
  }): CompleteMfaChallenge =>
  async (command) => {
    const securityEvents = deps.securityEvents ?? nullSecurityEventSink;
    const now = deps.clock.now();
    const found = await deps.store.findChallengeByTokenHash(
      deps.tokenService.hash(command.challengeToken),
    );
    if (found === undefined || found.consumedAt !== null || !found.isActive) {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        reason: 'invalid_or_consumed_challenge',
      });
      return result.err(mfaFailure.invalidChallenge());
    }
    if (found.expiresAt.getTime() <= now.getTime()) {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: found.identityId,
        reason: 'expired_challenge',
      });
      return result.err(mfaFailure.expiredChallenge());
    }

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

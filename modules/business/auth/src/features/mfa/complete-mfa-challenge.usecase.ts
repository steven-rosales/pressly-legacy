import type {
  AuthenticatedLoginResult,
  CompleteMfaChallengeRequest,
} from '@pressly/contracts';
import type {
  RecoveryCodeService,
  SecretBox,
  TotpAuthenticator,
} from '@pressly/auth/credentials';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { utcIsoFromDate } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import {
  expiredMfaChallenge,
  invalidMfaChallenge,
  invalidMfaCode,
} from './mfa.error.ts';
import type { Clock, MfaStore, TokenService } from './mfa.port.ts';

export type CompleteMfaChallenge = (
  command: CompleteMfaChallengeRequest & Readonly<{ requestId?: string }>,
) => Promise<Result<AuthenticatedLoginResult, AppError>>;

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

export const makeCompleteMfaChallenge =
  (deps: {
    store: MfaStore;
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
    if (result.isErr(found)) return found;
    if (
      found.value === undefined ||
      found.value.consumedAt !== null ||
      !found.value.isActive
    ) {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        reason: 'invalid_or_consumed_challenge',
      });
      return result.err(invalidMfaChallenge());
    }
    if (found.value.expiresAt.getTime() <= now.getTime()) {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: found.value.identityId,
        reason: 'expired_challenge',
      });
      return result.err(expiredMfaChallenge());
    }

    const accessToken = deps.tokenService.issue();
    const expiresAt = addMinutes(now, deps.sessionTtlMinutes);
    const baseCompletion = {
      challengeId: found.value.challengeId,
      identityId: found.value.identityId,
      sessionTokenHash: deps.tokenService.hash(accessToken),
      issuedAt: now,
      expiresAt,
    };
    const completed =
      command.method === 'totp'
        ? await completeTotp(
            deps,
            command.code,
            found.value,
            baseCompletion,
            now,
          )
        : await deps.store.completeRecoveryChallenge({
            ...baseCompletion,
            recoveryCodeHash: deps.recoveryCodes.hash(command.code),
          });

    if (result.isErr(completed)) return completed;
    if (completed.value.status === 'rejected') {
      securityEvents.emit({
        name: 'mfa.challenge_failed',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        principalId: found.value.identityId,
        reason: 'invalid_or_replayed_code',
      });
      return result.err(invalidMfaCode());
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
      principalId: found.value.identityId,
      resourceType: 'auth.identity',
      resourceId: found.value.identityId,
    });

    return result.ok({
      accessToken,
      expiresAt: utcIsoFromDate(completed.value.expiresAt),
      principal: {
        identityId: found.value.identityId,
        displayName: found.value.displayName,
        ...(found.value.email === undefined
          ? {}
          : { email: found.value.email }),
        roles: [...found.value.roles],
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
    return result.ok({ status: 'rejected' } as const);

  return deps.store.completeTotpChallenge({
    ...completion,
    counter: verification.counter,
  });
};

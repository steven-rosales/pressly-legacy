import { result, type Result } from '@pressly/kernel';
import { normalizeEmail } from '@pressly/auth/authentication';
import type { LoginRequest, LoginResult } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import { utcIsoFromDate } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { invalidCredentials, loginRateLimited } from './login.error.ts';
import type {
  Clock,
  LoginStore,
  PasswordVerifier,
  TokenIssuer,
} from './login.port.ts';

export type LoginOptions = Readonly<{
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
  mfaChallengeTtlMinutes: number;
}>;

export type LoginCommand = Readonly<
  LoginRequest & {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }
>;

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

const failureAttempt = (input: {
  emailNormalized: string;
  identityId?: string;
  ipAddress?: string;
  userAgent?: string;
}) => ({
  emailNormalized: input.emailNormalized,
  ...(input.identityId === undefined ? {} : { identityId: input.identityId }),
  success: false,
  failureCode: 'invalid_credentials',
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
});

const recordLoginFailure = async (
  store: LoginStore,
  securityEvents: SecurityEventSink,
  input: {
    emailNormalized: string;
    identityId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    occurredAt: Date;
  },
): Promise<void> => {
  await store.recordLoginAttempt(failureAttempt(input));
  await store.recordAuditEvent({
    ...(input.identityId === undefined
      ? {}
      : { principalIdentityId: input.identityId }),
    eventType: 'auth.login.failed',
    resourceType: 'auth_identity',
    ...(input.identityId === undefined ? {} : { resourceId: input.identityId }),
    metadata: { failureCode: 'invalid_credentials' },
  });
  securityEvents.emit({
    name: 'authentication.login_failed',
    occurredAt: input.occurredAt.toISOString(),
    outcome: 'denied',
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.identityId === undefined
      ? {}
      : { principalId: input.identityId }),
    resourceType: 'auth.identity',
    ...(input.identityId === undefined ? {} : { resourceId: input.identityId }),
    reason: 'invalid_credentials',
  });
};

type MakeLogin = {
  store: LoginStore;
  passwordVerifier: PasswordVerifier;
  tokenIssuer: TokenIssuer;
  clock: Clock;
  options: LoginOptions;
  securityEvents?: SecurityEventSink;
};

export type Login = (
  command: LoginCommand,
) => Promise<Result<LoginResult, AppError>>;

/**
 * Makes four checks before creating a login process:
 * - counts recent failed attempts,
 * - checks if the sure exists and is active,
 * - finds password credential,
 * - verifies password,
 *
 * and at each check, it either returns the error of the repo, or it records a failed attempts based on auth policy.
 *
 * Finally, after all the checks, an access token is created, issue and expire date are assigned, and session is created, and then the audit event is recorded.
 */
export const makeLogin =
  (deps: MakeLogin): Login =>
  async (command) => {
    const securityEvents = deps.securityEvents ?? nullSecurityEventSink;
    const now = deps.clock.now();
    const emailNormalized = normalizeEmail(command.email);
    const since = addMinutes(now, -deps.options.loginWindowMinutes);
    const failedAttempts = await deps.store.countRecentFailedAttempts({
      emailNormalized,
      since,
    });

    if (result.isErr(failedAttempts)) return failedAttempts;

    if (failedAttempts.value >= deps.options.loginMaxFailures) {
      await deps.store.recordAuditEvent({
        eventType: 'auth.login.rate_limited',
        resourceType: 'auth_identity',
        metadata: { failureCode: 'rate_limited' },
      });
      securityEvents.emit({
        name: 'authentication.login_rate_limited',
        occurredAt: now.toISOString(),
        outcome: 'denied',
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
        resourceType: 'auth.identity',
        reason: 'account_failure_window',
      });
      return result.err(loginRateLimited());
    }

    const identity = await deps.store.findIdentityByEmail(emailNormalized);

    if (result.isErr(identity)) return identity;

    if (identity.value === undefined) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        occurredAt: now,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
      });
      return result.err(invalidCredentials());
    }

    if (!identity.value.isActive) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.value.id,
        occurredAt: now,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
      });
      return result.err(invalidCredentials());
    }

    const credential = await deps.store.findPasswordCredential(
      identity.value.id,
    );

    if (result.isErr(credential)) return credential;

    if (credential.value === undefined) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.value.id,
        occurredAt: now,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
      });
      return result.err(invalidCredentials());
    }

    const verified = await deps.passwordVerifier.verify(
      credential.value.passwordHash,
      command.password,
    );

    if (result.isErr(verified)) return verified;

    if (!verified.value) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.value.id,
        occurredAt: now,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
        ...(command.requestId === undefined
          ? {}
          : { requestId: command.requestId }),
      });
      return result.err(invalidCredentials());
    }

    const accessToken = deps.tokenIssuer.issue();
    // An enrolled second factor belongs to the identity, not to one current
    // role projection. Always honor it so an invited or temporarily unassigned
    // identity cannot fall back to password-only authentication.
    const requiresMfa = identity.value.mfaEnabled;

    if (requiresMfa) {
      const challengeToken = accessToken;
      const challengeExpiresAt = addMinutes(
        now,
        deps.options.mfaChallengeTtlMinutes,
      );
      const challenge = await deps.store.createMfaChallenge({
        identityId: identity.value.id,
        tokenHash: deps.tokenIssuer.hash(challengeToken),
        expiresAt: challengeExpiresAt,
      });
      if (result.isErr(challenge)) return challenge;

      await deps.store.recordLoginAttempt({
        emailNormalized,
        identityId: identity.value.id,
        success: true,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
      });
      await deps.store.recordAuditEvent({
        principalIdentityId: identity.value.id,
        eventType: 'auth.mfa.challenge_created',
        resourceType: 'auth_identity',
        resourceId: identity.value.id,
      });

      return result.ok({
        status: 'mfa_required',
        challengeToken,
        expiresAt: utcIsoFromDate(challengeExpiresAt),
      });
    }

    const issuedAt = now;
    const expiresAt = addMinutes(now, deps.options.sessionTtlMinutes);
    const session = await deps.store.createSession({
      identityId: identity.value.id,
      tokenHash: deps.tokenIssuer.hash(accessToken),
      issuedAt,
      expiresAt,
      lastUsedAt: now,
      assuranceLevel: 'password',
    });

    if (result.isErr(session)) return session;

    await deps.store.recordLoginAttempt({
      emailNormalized,
      identityId: identity.value.id,
      success: true,
      ...(command.ipAddress === undefined
        ? {}
        : { ipAddress: command.ipAddress }),
      ...(command.userAgent === undefined
        ? {}
        : { userAgent: command.userAgent }),
    });

    await deps.store.recordAuditEvent({
      principalIdentityId: identity.value.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: session.value.id,
      metadata: {},
    });
    securityEvents.emit({
      name: 'authentication.login_succeeded',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(command.requestId === undefined
        ? {}
        : { requestId: command.requestId }),
      principalId: identity.value.id,
      sessionId: session.value.id,
      resourceType: 'auth.session',
      resourceId: session.value.id,
    });

    return result.ok({
      accessToken,
      expiresAt: utcIsoFromDate(session.value.expiresAt),
      principal: {
        identityId: identity.value.id,
        displayName: identity.value.displayName,
        ...(identity.value.email === undefined
          ? {}
          : { email: identity.value.email }),
        roles: [...identity.value.roles],
      },
    });
  };

import { result, type Result } from '@pressly/kernel';
import { normalizeEmail } from '@pressly/auth/authentication';
import type { Clock } from '@pressly/time';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { loginFailure, type LoginFailure } from './login.failure.ts';
import type {
  LoginStore,
  PasswordVerifier,
  TokenIssuer,
} from './login.port.ts';
import type { LoginCommand, LoginOutcome } from './login.model.ts';

export type LoginOptions = Readonly<{
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
  mfaChallengeTtlMinutes: number;
}>;

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
) => Promise<Result<LoginOutcome, LoginFailure>>;

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

    if (failedAttempts >= deps.options.loginMaxFailures) {
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
      return result.err(loginFailure.rateLimited());
    }

    const identity = await deps.store.findIdentityByEmail(emailNormalized);

    if (identity === undefined) {
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
      return result.err(loginFailure.invalidCredentials());
    }

    if (!identity.isActive) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.id,
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
      return result.err(loginFailure.invalidCredentials());
    }

    const credential = await deps.store.findPasswordCredential(identity.id);

    if (credential === undefined) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.id,
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
      return result.err(loginFailure.invalidCredentials());
    }

    const verified = await deps.passwordVerifier.verify(
      credential.passwordHash,
      command.password,
    );

    if (!verified) {
      await recordLoginFailure(deps.store, securityEvents, {
        emailNormalized,
        identityId: identity.id,
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
      return result.err(loginFailure.invalidCredentials());
    }

    const accessToken = deps.tokenIssuer.issue();
    // An enrolled second factor belongs to the identity, not to one current
    // role projection. Always honor it so an invited or temporarily unassigned
    // identity cannot fall back to password-only authentication.
    const requiresMfa = identity.mfaEnabled;

    if (requiresMfa) {
      const challengeToken = accessToken;
      const challengeExpiresAt = addMinutes(
        now,
        deps.options.mfaChallengeTtlMinutes,
      );
      await deps.store.createMfaChallenge({
        identityId: identity.id,
        tokenHash: deps.tokenIssuer.hash(challengeToken),
        expiresAt: challengeExpiresAt,
      });
      await deps.store.recordLoginAttempt({
        emailNormalized,
        identityId: identity.id,
        success: true,
        ...(command.ipAddress === undefined
          ? {}
          : { ipAddress: command.ipAddress }),
        ...(command.userAgent === undefined
          ? {}
          : { userAgent: command.userAgent }),
      });
      await deps.store.recordAuditEvent({
        principalIdentityId: identity.id,
        eventType: 'auth.mfa.challenge_created',
        resourceType: 'auth_identity',
        resourceId: identity.id,
      });

      return result.ok({
        status: 'mfa_required',
        challengeToken,
        expiresAt: challengeExpiresAt,
      });
    }

    const issuedAt = now;
    const expiresAt = addMinutes(now, deps.options.sessionTtlMinutes);
    const session = await deps.store.createSession({
      identityId: identity.id,
      tokenHash: deps.tokenIssuer.hash(accessToken),
      issuedAt,
      expiresAt,
      lastUsedAt: now,
      assuranceLevel: 'password',
    });

    await deps.store.recordLoginAttempt({
      emailNormalized,
      identityId: identity.id,
      success: true,
      ...(command.ipAddress === undefined
        ? {}
        : { ipAddress: command.ipAddress }),
      ...(command.userAgent === undefined
        ? {}
        : { userAgent: command.userAgent }),
    });

    await deps.store.recordAuditEvent({
      principalIdentityId: identity.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: session.id,
      metadata: {},
    });
    securityEvents.emit({
      name: 'authentication.login_succeeded',
      occurredAt: now.toISOString(),
      outcome: 'succeeded',
      ...(command.requestId === undefined
        ? {}
        : { requestId: command.requestId }),
      principalId: identity.id,
      sessionId: session.id,
      resourceType: 'auth.session',
      resourceId: session.id,
    });

    return result.ok({
      accessToken,
      expiresAt: session.expiresAt,
      principal: {
        identityId: identity.id,
        displayName: identity.displayName,
        ...(identity.email === undefined ? {} : { email: identity.email }),
        roles: [...identity.roles],
      },
    });
  };

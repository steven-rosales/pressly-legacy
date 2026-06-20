import { result, type Result } from '@pressly/kernel';
import { normalizeEmail } from '@pressly/auth';
import type { LoginCommand, LoginResult } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import { utcIsoFromDate } from '@pressly/time';
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

type MakeLogin = {
  store: LoginStore;
  passwordVerifier: PasswordVerifier;
  tokenIssuer: TokenIssuer;
  clock: Clock;
  options: LoginOptions;
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
    const now = deps.clock.now();
    const emailNormalized = normalizeEmail(command.email);
    const since = addMinutes(now, -deps.options.loginWindowMinutes);
    const failedAttempts = await deps.store.countRecentFailedAttempts({
      emailNormalized,
      since,
    });

    if (result.isErr(failedAttempts)) return failedAttempts;

    if (failedAttempts.value >= deps.options.loginMaxFailures)
      return result.err(loginRateLimited());

    const identity = await deps.store.findIdentityByEmail(emailNormalized);

    if (result.isErr(identity)) return identity;

    if (identity.value === undefined || !identity.value.isActive) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          ...(command.ipAddress === undefined
            ? {}
            : { ipAddress: command.ipAddress }),
          ...(command.userAgent === undefined
            ? {}
            : { userAgent: command.userAgent }),
        }),
      );
      return result.err(invalidCredentials());
    }

    const credential = await deps.store.findPasswordCredential(
      identity.value.id,
    );

    if (result.isErr(credential)) return credential;

    if (credential.value === undefined) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          identityId: identity.value.id,
          ...(command.ipAddress === undefined
            ? {}
            : { ipAddress: command.ipAddress }),
          ...(command.userAgent === undefined
            ? {}
            : { userAgent: command.userAgent }),
        }),
      );
      return result.err(invalidCredentials());
    }

    const verified = await deps.passwordVerifier.verify(
      credential.value.passwordHash,
      command.password,
    );

    if (result.isErr(verified)) return verified;

    if (!verified.value) {
      await deps.store.recordLoginAttempt(
        failureAttempt({
          emailNormalized,
          identityId: identity.value.id,
          ...(command.ipAddress === undefined
            ? {}
            : { ipAddress: command.ipAddress }),
          ...(command.userAgent === undefined
            ? {}
            : { userAgent: command.userAgent }),
        }),
      );
      return result.err(invalidCredentials());
    }

    const accessToken = deps.tokenIssuer.issue();
    const issuedAt = now;
    const expiresAt = addMinutes(now, deps.options.sessionTtlMinutes);
    const session = await deps.store.createSession({
      identityId: identity.value.id,
      tokenHash: deps.tokenIssuer.hash(accessToken),
      issuedAt,
      expiresAt,
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
      actorIdentityId: identity.value.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: session.value.id,
      metadata: { email: emailNormalized },
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

import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '@pressly/errors/app-error';
import { makeAppError } from '@pressly/errors/app-error';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import type { Clock } from '@pressly/time';
import type {
  PasswordVerifier,
  TokenIssuer,
} from '../../../../src/features/sessions/login/login.port.ts';
import {
  makeLogin,
  type LoginOptions,
} from '../../../../src/features/sessions/login/login.usecase.ts';
import {
  makeDefaultIdentity,
  makeDefaultOptions,
  makeDefaultSession,
  makeLoginCommand,
  now,
} from '../../../support/builders.ts';
import { makeFakeLoginStore, type FakeStoreOptions } from './login.fake.ts';

const accessToken = 'access-token-with-at-least-thirty-two-chars';

const dependencyError = (code: string): AppError =>
  makeAppError({
    kind: 'UnexpectedError',
    code,
    message: 'Dependency failed.',
    status: 500,
  });

const makeSubject = (
  input: {
    store?: FakeStoreOptions;
    passwordVerified?: boolean;
    passwordVerifierError?: AppError;
    options?: Partial<LoginOptions>;
  } = {},
) => {
  const { store, calls } = makeFakeLoginStore(input.store);

  const passwordVerifier: PasswordVerifier = {
    verify: vi.fn(async () => {
      if (input.passwordVerifierError !== undefined)
        throw input.passwordVerifierError;
      return input.passwordVerified ?? true;
    }),
  };

  const tokenIssuer: TokenIssuer = {
    issue: vi.fn(() => accessToken),
    hash: vi.fn((token) => `hash:${token}`),
  };

  const clock: Clock = { now: vi.fn(() => now) };

  const login = makeLogin({
    store,
    passwordVerifier,
    tokenIssuer,
    clock,
    options: { ...makeDefaultOptions(), ...input.options },
  });

  return { login, calls, passwordVerifier, tokenIssuer, clock };
};

describe('login user', () => {
  it('creates a session, records a successful attempt, and records an audit event', async () => {
    const { login, calls, passwordVerifier, tokenIssuer } = makeSubject();

    const actual = await login(
      makeLoginCommand({ ipAddress: '127.0.0.1', userAgent: 'vitest' }),
    );

    const value = expectOk(actual);

    expect(calls.countRecentFailedAttempts).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        since: new Date('2026-05-29T11:45:00.000Z'),
      },
    ]);
    expect(calls.findIdentityByEmail).toEqual(['admin@pressly.com']);
    expect(calls.findPasswordCredential).toEqual([makeDefaultIdentity().id]);

    expect(passwordVerifier.verify).toHaveBeenCalledWith(
      'stored-password-hash',
      'correct-password',
    );

    expect(tokenIssuer.issue).toHaveBeenCalledTimes(1);
    expect(tokenIssuer.hash).toHaveBeenCalledWith(accessToken);

    expect(calls.createSession).toEqual([
      {
        identityId: makeDefaultIdentity().id,
        tokenHash: `hash:${accessToken}`,
        issuedAt: now,
        expiresAt: new Date('2026-05-29T12:30:00.000Z'),
        lastUsedAt: now,
        assuranceLevel: 'password',
      },
    ]);

    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: true,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
    ]);

    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.login.succeeded',
        resourceType: 'auth_session',
        resourceId: makeDefaultSession().id,
        metadata: {},
      },
    ]);

    expect(value).toEqual({
      accessToken,
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
      principal: {
        identityId: makeDefaultIdentity().id,
        displayName: 'Admin User',
        email: 'admin@pressly.com',
        roles: ['admin'],
      },
    });
  });

  it('creates a short-lived challenge instead of a session when privileged MFA is enabled', async () => {
    const { login, calls } = makeSubject({
      store: {
        identity: makeDefaultIdentity({ mfaEnabled: true, roles: ['owner'] }),
      },
    });

    const actual = await login(makeLoginCommand());

    expect(actual).toEqual({
      tag: 'ok',
      value: {
        status: 'mfa_required',
        challengeToken: accessToken,
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
      },
    });
    expect(calls.createSession).toEqual([]);
    expect(calls.createMfaChallenge).toEqual([
      {
        identityId: makeDefaultIdentity().id,
        tokenHash: `hash:${accessToken}`,
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
      },
    ]);
    expect(calls.recordAuditEvent).toContainEqual({
      principalIdentityId: makeDefaultIdentity().id,
      eventType: 'auth.mfa.challenge_created',
      resourceType: 'auth_identity',
      resourceId: makeDefaultIdentity().id,
    });
  });

  it('requires the MFA challenge for a manager backed by workforce authority', async () => {
    const { login, calls } = makeSubject({
      store: {
        identity: makeDefaultIdentity({
          mfaEnabled: true,
          roles: ['manager'],
        }),
      },
    });

    const actual = await login(makeLoginCommand());

    expect(actual).toEqual({
      tag: 'ok',
      value: {
        status: 'mfa_required',
        challengeToken: accessToken,
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
      },
    });
    expect(calls.createSession).toEqual([]);
    expect(calls.createMfaChallenge).toHaveLength(1);
  });

  it('honors enrolled MFA without a current role projection', async () => {
    const { login, calls } = makeSubject({
      store: {
        identity: makeDefaultIdentity({
          mfaEnabled: true,
          roles: [],
        }),
      },
    });

    const actual = await login(makeLoginCommand());

    expect(actual).toEqual({
      tag: 'ok',
      value: {
        status: 'mfa_required',
        challengeToken: accessToken,
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
      },
    });
    expect(calls.createSession).toEqual([]);
    expect(calls.createMfaChallenge).toHaveLength(1);
  });

  it('rate limits before looking up the identity', async () => {
    const { login, calls } = makeSubject({
      store: { failedAttempts: 5 },
      options: { loginMaxFailures: 5 },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'login_rate_limited');
    expect(calls.countRecentFailedAttempts).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        since: new Date('2026-05-29T11:45:00.000Z'),
      },
    ]);
    expect(calls.findIdentityByEmail).toEqual([]);
    expect(calls.findPasswordCredential).toEqual([]);
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([
      {
        eventType: 'auth.login.rate_limited',
        resourceType: 'auth_identity',
        metadata: { failureCode: 'rate_limited' },
      },
    ]);
  });

  it('records a failed attempt when the identity does not exist', async () => {
    const { login, calls } = makeSubject({
      store: { identity: undefined },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'invalid_credentials');
    expect(calls.findPasswordCredential).toEqual([]);
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        success: false,
        failureCode: 'invalid_credentials',
      },
    ]);
    expect(calls.recordAuditEvent).toEqual([
      {
        eventType: 'auth.login.failed',
        resourceType: 'auth_identity',
        metadata: { failureCode: 'invalid_credentials' },
      },
    ]);
  });

  it('records a failed attempt when the identity is inactive', async () => {
    const { login, calls } = makeSubject({
      store: {
        identity: {
          ...makeDefaultIdentity(),
          isActive: false,
        },
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'invalid_credentials');
    expect(calls.findPasswordCredential).toEqual([]);
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: false,
        failureCode: 'invalid_credentials',
      },
    ]);
    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.login.failed',
        resourceType: 'auth_identity',
        resourceId: makeDefaultIdentity().id,
        metadata: { failureCode: 'invalid_credentials' },
      },
    ]);
  });

  it('records a failed attempt when no password credential exists', async () => {
    const { login, calls, passwordVerifier } = makeSubject({
      store: { credential: undefined },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'invalid_credentials');
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: false,
        failureCode: 'invalid_credentials',
      },
    ]);
    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.login.failed',
        resourceType: 'auth_identity',
        resourceId: makeDefaultIdentity().id,
        metadata: { failureCode: 'invalid_credentials' },
      },
    ]);
  });

  it('records a failed attempt when the password is wrong', async () => {
    const { login, calls } = makeSubject({
      passwordVerified: false,
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'invalid_credentials');
    expect(calls.createSession).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.login.failed',
        resourceType: 'auth_identity',
        resourceId: makeDefaultIdentity().id,
        metadata: { failureCode: 'invalid_credentials' },
      },
    ]);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: false,
        failureCode: 'invalid_credentials',
      },
    ]);
  });

  it('throws create session failures without recording success side effects', async () => {
    const error = dependencyError('create_session_failed');
    const { login, calls } = makeSubject({
      store: { createSessionError: error },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.createSession).toHaveLength(1);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws failed attempt count failures before identity lookup', async () => {
    const error = dependencyError('count_failed_attempts_failed');
    const { login, calls, passwordVerifier } = makeSubject({
      store: { countRecentFailedAttemptsError: error },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.findIdentityByEmail).toEqual([]);
    expect(calls.findPasswordCredential).toEqual([]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws identity lookup failures before credential lookup', async () => {
    const error = dependencyError('identity_lookup_failed');
    const { login, calls, passwordVerifier } = makeSubject({
      store: { findIdentityByEmailError: error },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.findPasswordCredential).toEqual([]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws credential lookup failures before password verification', async () => {
    const error = dependencyError('credential_lookup_failed');
    const { login, calls, passwordVerifier } = makeSubject({
      store: { findPasswordCredentialError: error },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.findPasswordCredential).toEqual([makeDefaultIdentity().id]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws password verifier failures before creating a session', async () => {
    const error = dependencyError('password_verify_failed');
    const { login, calls } = makeSubject({
      passwordVerifierError: error,
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('allows login when failed attempts are still below the limit', async () => {
    const { login, calls } = makeSubject({
      store: { failedAttempts: 4 },
      options: { loginMaxFailures: 5 },
    });

    const actual = await login(makeLoginCommand());

    expectOk(actual);
    expect(calls.findIdentityByEmail).toEqual(['admin@pressly.com']);
    expect(calls.createSession).toHaveLength(1);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: true,
      },
    ]);
  });

  it('uses configured login window and session ttl', async () => {
    const { login, calls } = makeSubject({
      options: {
        loginWindowMinutes: 60,
        sessionTtlMinutes: 5,
      },
    });

    const actual = await login(makeLoginCommand());

    expectOk(actual);
    expect(calls.countRecentFailedAttempts).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        since: new Date('2026-05-29T11:00:00.000Z'),
      },
    ]);
    expect(calls.createSession).toEqual([
      {
        identityId: makeDefaultIdentity().id,
        tokenHash: `hash:${accessToken}`,
        issuedAt: now,
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
        lastUsedAt: now,
        assuranceLevel: 'password',
      },
    ]);
  });

  it('omits principal email when the identity has no email', async () => {
    const { email: _email, ...identityWithoutEmail } = makeDefaultIdentity();
    const { login } = makeSubject({
      store: {
        identity: identityWithoutEmail,
      },
    });

    const actual = await login(makeLoginCommand());

    const value = expectOk(actual);
    if ('status' in value) throw new Error('Expected authenticated login.');
    expect(value.principal).toEqual({
      identityId: makeDefaultIdentity().id,
      displayName: 'Admin User',
      roles: ['admin'],
    });
    expect('email' in value.principal).toBe(false);
  });

  it('throws when failed-attempt recording fails', async () => {
    const error = dependencyError('record_login_attempt_failed');
    const { login, calls } = makeSubject({
      store: {
        identity: undefined,
        recordLoginAttemptError: error,
      },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        success: false,
        failureCode: 'invalid_credentials',
      },
    ]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws when audit recording fails', async () => {
    const error = dependencyError('audit_record_failed');
    const { login, calls } = makeSubject({
      store: { recordAuditEventError: error },
    });

    await expect(login(makeLoginCommand())).rejects.toBe(error);
    expect(calls.recordLoginAttempt).toEqual([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: makeDefaultIdentity().id,
        success: true,
      },
    ]);
    expect(calls.recordAuditEvent).toHaveLength(1);
  });
});

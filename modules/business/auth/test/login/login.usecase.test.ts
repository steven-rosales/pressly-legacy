import { result, type Result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '@pressly/errors';
import { makeAppError } from '@pressly/errors';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import type {
  Clock,
  PasswordVerifier,
  TokenIssuer,
} from '../../src/login/login.port.ts';
import { makeLogin, type LoginOptions } from '../../src/login/login.usecase.ts';
import {
  makeDefaultIdentity,
  makeDefaultOptions,
  makeDefaultSession,
  makeLoginCommand,
  now,
} from '../support/builders.ts';
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
    passwordVerifierResult?: Result<boolean, AppError>;
    options?: Partial<LoginOptions>;
  } = {},
) => {
  const { store, calls } = makeFakeLoginStore(input.store);

  const passwordVerifier: PasswordVerifier = {
    verify: vi.fn(
      async () =>
        input.passwordVerifierResult ??
        result.ok(input.passwordVerified ?? true),
    ),
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
        metadata: { email: 'admin@pressly.com' },
      },
    ]);

    expect(value).toEqual({
      accessToken,
      expiresAt: '2026-05-29T12:30:00.000Z',
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
        expiresAt: '2026-05-29T12:05:00.000Z',
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
        metadata: { email: 'admin@pressly.com' },
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
        metadata: {
          email: 'admin@pressly.com',
          failureCode: 'invalid_credentials',
        },
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
        metadata: {
          email: 'admin@pressly.com',
          failureCode: 'invalid_credentials',
        },
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
        metadata: {
          email: 'admin@pressly.com',
          failureCode: 'invalid_credentials',
        },
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
        metadata: {
          email: 'admin@pressly.com',
          failureCode: 'invalid_credentials',
        },
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

  it('returns create session failures without recording success side effects', async () => {
    const { login, calls } = makeSubject({
      store: {
        createSessionResult: result.err(
          dependencyError('create_session_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'create_session_failed');
    expect(calls.createSession).toHaveLength(1);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('returns failed attempt count failures before identity lookup', async () => {
    const { login, calls, passwordVerifier } = makeSubject({
      store: {
        countRecentFailedAttemptsResult: result.err(
          dependencyError('count_failed_attempts_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'count_failed_attempts_failed');
    expect(calls.findIdentityByEmail).toEqual([]);
    expect(calls.findPasswordCredential).toEqual([]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('returns identity lookup failures before credential lookup', async () => {
    const { login, calls, passwordVerifier } = makeSubject({
      store: {
        findIdentityByEmailResult: result.err(
          dependencyError('identity_lookup_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'identity_lookup_failed');
    expect(calls.findPasswordCredential).toEqual([]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('returns credential lookup failures before password verification', async () => {
    const { login, calls, passwordVerifier } = makeSubject({
      store: {
        findPasswordCredentialResult: result.err(
          dependencyError('credential_lookup_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'credential_lookup_failed');
    expect(calls.findPasswordCredential).toEqual([makeDefaultIdentity().id]);
    expect(passwordVerifier.verify).not.toHaveBeenCalled();
    expect(calls.createSession).toEqual([]);
    expect(calls.recordLoginAttempt).toEqual([]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('returns password verifier failures before creating a session', async () => {
    const { login, calls } = makeSubject({
      passwordVerifierResult: result.err(
        dependencyError('password_verify_failed'),
      ),
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'password_verify_failed');
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

  it('keeps invalid credentials when failed-attempt recording fails', async () => {
    const { login, calls } = makeSubject({
      store: {
        identity: undefined,
        recordLoginAttemptResult: result.err(
          dependencyError('record_login_attempt_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectErrCode(actual, 'invalid_credentials');
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
        metadata: {
          email: 'admin@pressly.com',
          failureCode: 'invalid_credentials',
        },
      },
    ]);
  });

  it('keeps successful login when audit recording fails', async () => {
    const { login, calls } = makeSubject({
      store: {
        recordAuditEventResult: result.err(
          dependencyError('audit_record_failed'),
        ),
      },
    });

    const actual = await login(makeLoginCommand());

    expectOk(actual);
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

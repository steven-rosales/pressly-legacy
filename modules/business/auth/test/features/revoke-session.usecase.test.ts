import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '@pressly/errors';
import { makeAppError } from '@pressly/errors';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import type {
  Clock,
  TokenHasher,
} from '../../src/features/revoke-session/revoke-session.port.ts';
import { makeRevokeSession } from '../../src/features/revoke-session/revoke-session.usecase.ts';
import {
  makeDefaultIdentity,
  makeDefaultSession,
  now,
} from '../support/builders.ts';
import {
  makeFakeRevokeSessionStore,
  type FakeRevokeSessionStoreOptions,
} from '../support/fakes.ts';

const bearer = 'bearer-token-with-at-least-thirty-two-chars';

const dependencyError = (code: string): AppError =>
  makeAppError({
    kind: 'UnexpectedError',
    code,
    message: 'Dependency failed.',
    status: 500,
  });

const makeSubject = (input: { store?: FakeRevokeSessionStoreOptions } = {}) => {
  const { store, calls } = makeFakeRevokeSessionStore(input.store);

  const tokenHasher: TokenHasher = {
    hash: vi.fn((rawToken) => `hash:${rawToken}`),
  };

  const clock: Clock = {
    now: vi.fn(() => now),
  };

  const revokeSession = makeRevokeSession({
    store,
    tokenHasher,
    clock,
  });

  return { revokeSession, calls, tokenHasher, clock };
};

describe('revoke session', () => {
  it('revokes a session by token hash and records a logout audit event', async () => {
    const { revokeSession, calls, tokenHasher, clock } = makeSubject();

    const actual = await revokeSession({ bearerToken: bearer });

    expectOk(actual);

    expect(tokenHasher.hash).toHaveBeenCalledWith(bearer);
    expect(clock.now).toHaveBeenCalledTimes(1);
    expect(calls.revokeByTokenHash).toEqual([
      { tokenHash: `hash:${bearer}`, revokedAt: now },
    ]);
    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: makeDefaultSession().id,
      },
    ]);
  });

  it('returns the logout result shape', async () => {
    const { revokeSession } = makeSubject();

    const actual = await revokeSession({ bearerToken: bearer });

    expect(expectOk(actual)).toEqual({ revoked: true });
  });

  it('keeps logout idempotent when no session is revoked', async () => {
    const { revokeSession, calls } = makeSubject({
      store: { revoked: {} },
    });

    const actual = await revokeSession({ bearerToken: bearer });

    expectOk(actual);

    expect(calls.revokeByTokenHash).toEqual([
      { tokenHash: `hash:${bearer}`, revokedAt: now },
    ]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('does not record an audit event when the revoked session has no identity id', async () => {
    const { revokeSession, calls } = makeSubject({
      store: {
        revoked: {
          sessionId: makeDefaultSession().id,
        },
      },
    });

    const actual = await revokeSession({ bearerToken: bearer });

    expectOk(actual);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('does not record an audit event when the revoked session has no session id', async () => {
    const { revokeSession, calls } = makeSubject({
      store: {
        revoked: {
          identityId: makeDefaultIdentity().id,
        },
      },
    });

    const actual = await revokeSession({ bearerToken: bearer });

    expectOk(actual);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('returns revoke failures before recording an audit event', async () => {
    const { revokeSession, calls } = makeSubject({
      store: {
        revokeByTokenHashResult: result.err(
          dependencyError('session_revoke_failed'),
        ),
      },
    });

    const actual = await revokeSession({ bearerToken: bearer });

    expectErrCode(actual, 'session_revoke_failed');
    expect(calls.revokeByTokenHash).toEqual([
      { tokenHash: `hash:${bearer}`, revokedAt: now },
    ]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('keeps logout successful when audit recording fails', async () => {
    const { revokeSession, calls } = makeSubject({
      store: {
        recordAuditEventResult: result.err(
          dependencyError('audit_record_failed'),
        ),
      },
    });

    const actual = await revokeSession({ bearerToken: bearer });

    expectOk(actual);
    expect(calls.recordAuditEvent).toEqual([
      {
        principalIdentityId: makeDefaultIdentity().id,
        eventType: 'auth.logout',
        resourceType: 'auth_session',
        resourceId: makeDefaultSession().id,
      },
    ]);
  });
});

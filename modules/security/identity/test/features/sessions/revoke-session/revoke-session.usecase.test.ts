import { describe, expect, it, vi } from 'vitest';
import type { AppError } from '@pressly/errors/app-error';
import { makeAppError } from '@pressly/errors/app-error';
import type { Clock } from '@pressly/time';
import type { TokenHasher } from '../../../../src/features/sessions/revoke-session/revoke-session.port.ts';
import { makeRevokeSession } from '../../../../src/features/sessions/revoke-session/revoke-session.usecase.ts';
import {
  makeDefaultIdentity,
  makeDefaultSession,
  now,
} from '../../../support/builders.ts';
import {
  makeFakeRevokeSessionStore,
  type FakeRevokeSessionStoreOptions,
} from './revoke-session.fake.ts';

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

    await revokeSession({ bearerToken: bearer });

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

    expect(actual).toEqual({ revoked: true });
  });

  it('keeps logout idempotent when no session is revoked', async () => {
    const { revokeSession, calls } = makeSubject({
      store: { revoked: {} },
    });

    await revokeSession({ bearerToken: bearer });

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

    await revokeSession({ bearerToken: bearer });
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

    await revokeSession({ bearerToken: bearer });
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws revoke failures before recording an audit event', async () => {
    const error = dependencyError('session_revoke_failed');
    const { revokeSession, calls } = makeSubject({
      store: { revokeByTokenHashError: error },
    });

    await expect(revokeSession({ bearerToken: bearer })).rejects.toBe(error);
    expect(calls.revokeByTokenHash).toEqual([
      { tokenHash: `hash:${bearer}`, revokedAt: now },
    ]);
    expect(calls.recordAuditEvent).toEqual([]);
  });

  it('throws when audit recording fails', async () => {
    const error = dependencyError('audit_record_failed');
    const { revokeSession, calls } = makeSubject({
      store: { recordAuditEventError: error },
    });

    await expect(revokeSession({ bearerToken: bearer })).rejects.toBe(error);
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

import { describe, expect, it, vi } from 'vitest';
import { businessScope } from '../../../model/authorization/public.ts';
import type { AppError } from '@pressly/errors/app-error';
import { makeAppError } from '@pressly/errors/app-error';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import type { Clock } from '@pressly/time';
import {
  makeFakeLoadSessionStore,
  type FakeLoadSessionStoreOptions,
} from './load-session.spec-support.ts';
import {
  makeDefaultSession,
  makeDefaultStoredSessionPrincipal,
  now,
} from '../../../testing/builders.spec-support.ts';
import { makeLoadSession } from './load-session.usecase.ts';
import type { TokenHasher } from './load-session.port.ts';
import { loadSessionCellDeclaration } from './cell.ts';

const bearer = 'bearer-token-with-at-least-thirty-two-chars';

const dependencyError = (code: string): AppError =>
  makeAppError({
    kind: 'UnexpectedError',
    code,
    message: 'Dependency failed.',
    status: 500,
  });

const makeSubject = (input: { store?: FakeLoadSessionStoreOptions } = {}) => {
  const { store, calls } = makeFakeLoadSessionStore(input.store);

  const tokenHasher: TokenHasher = {
    hash: vi.fn((rawToken) => `hash:${rawToken}`),
  };

  const clock: Clock = {
    now: vi.fn(() => now),
  };

  const loadSession = makeLoadSession({
    store,
    tokenHasher,
    clock,
    idleTimeoutMinutes: 30,
  });

  return { loadSession, calls, tokenHasher, clock };
};

describe('loads principal session', () => {
  proveOperation({
    operationId: 'access.load-session.v1',
    declaration: loadSessionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'loads an active session touches it and returns the principal',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = { bearerToken: bearer };
          expect(
            loadSessionCellDeclaration.contract.input.decode(input).kind,
          ).toBe('valid');
          const { loadSession, calls, tokenHasher } = makeSubject();

          const actual = await loadSession(input);
          const value = expectOk(actual);

          expect(tokenHasher.hash).toHaveBeenCalledWith(bearer);
          expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
          expect(calls.touchSession).toEqual([
            { sessionId: makeDefaultSession().id, now },
          ]);
          expect(value).toEqual({
            principal: {
              identityId: '00000000-0000-4000-8000-000000000001',
              kind: 'human',
              displayName: 'Admin User',
              email: 'admin@pressly.com',
              sessionId: '00000000-0000-4000-8000-000000000002',
              sessionIssuedAt: new Date('2026-05-29T11:30:00.000Z'),
              sessionExpiresAt: new Date('2026-05-29T12:30:00.000Z'),
            },
            principalAttributes: {
              assignments: [
                {
                  role: 'owner',
                  scope: businessScope('00000000-0000-4000-8000-000000000010'),
                  state: 'active',
                  version: 1,
                },
              ],
              identityActive: true,
              assuranceLevel: 'password',
            },
          });
        },
      },
    ],
  });

  it('returns invalid_session when no session exists for the token hash', async () => {
    const { loadSession, calls } = makeSubject({
      store: { principal: undefined },
    });

    const actual = await loadSession({ bearerToken: bearer });

    expectErrCode(actual, 'invalid_session');
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([]);
  });

  it('returns invalid_session when the identity is inactive', async () => {
    const { loadSession, calls } = makeSubject({
      store: {
        principal: makeDefaultStoredSessionPrincipal({ isActive: false }),
      },
    });

    const actual = await loadSession({ bearerToken: bearer });

    expectErrCode(actual, 'invalid_session');
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([]);
  });

  it('returns invalid_session when the session is revoked', async () => {
    const { loadSession, calls } = makeSubject({
      store: {
        principal: makeDefaultStoredSessionPrincipal({
          revokedAt: new Date('2026-05-29T11:59:00.000Z'),
        }),
      },
    });

    const actual = await loadSession({ bearerToken: bearer });

    expectErrCode(actual, 'invalid_session');
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([]);
  });

  it('returns session_expired when the session expires at the current time', async () => {
    const { loadSession, calls } = makeSubject({
      store: {
        principal: makeDefaultStoredSessionPrincipal({ expiresAt: now }),
      },
    });

    const actual = await loadSession({ bearerToken: bearer });

    expectErrCode(actual, 'session_expired');
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([]);
  });

  it('returns session_expired when the idle timeout is reached', async () => {
    const { loadSession, calls } = makeSubject({
      store: {
        principal: makeDefaultStoredSessionPrincipal({
          lastUsedAt: new Date('2026-05-29T11:30:00.000Z'),
        }),
      },
    });

    const actual = await loadSession({ bearerToken: bearer });

    expectErrCode(actual, 'session_expired');
    expect(calls.touchSession).toEqual([]);
  });

  it('throws lookup failures before touching the session', async () => {
    const error = dependencyError('session_lookup_failed');
    const { loadSession, calls } = makeSubject({
      store: {
        findByTokenHashError: error,
      },
    });

    await expect(loadSession({ bearerToken: bearer })).rejects.toBe(error);
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([]);
  });

  it('throws touch failures after the session passes validation', async () => {
    const error = dependencyError('touch_session_failed');
    const { loadSession, calls } = makeSubject({
      store: {
        touchSessionError: error,
      },
    });

    await expect(loadSession({ bearerToken: bearer })).rejects.toBe(error);
    expect(calls.findByTokenHash).toEqual([`hash:${bearer}`]);
    expect(calls.touchSession).toEqual([
      { sessionId: makeDefaultSession().id, now },
    ]);
  });

  it('omits principal email when the stored principal has no email', async () => {
    const { email: _email, ...principalWithoutEmail } =
      makeDefaultStoredSessionPrincipal();
    const { loadSession } = makeSubject({
      store: { principal: principalWithoutEmail },
    });

    const actual = await loadSession({ bearerToken: bearer });

    const value = expectOk(actual);
    expect(value).toEqual({
      principal: {
        identityId: '00000000-0000-4000-8000-000000000001',
        kind: 'human',
        displayName: 'Admin User',
        sessionId: '00000000-0000-4000-8000-000000000002',
        sessionIssuedAt: new Date('2026-05-29T11:30:00.000Z'),
        sessionExpiresAt: new Date('2026-05-29T12:30:00.000Z'),
      },
      principalAttributes: {
        assignments: [
          {
            role: 'owner',
            scope: businessScope('00000000-0000-4000-8000-000000000010'),
            state: 'active',
            version: 1,
          },
        ],
        identityActive: true,
        assuranceLevel: 'password',
      },
    });
    expect('email' in value.principal).toBe(false);
  });

  it('returns a copy of assignments instead of the stored assignments array', async () => {
    const assignments = [
      {
        role: 'manager',
        scope: businessScope('00000000-0000-4000-8000-000000000010'),
        state: 'active',
        version: 1,
      },
    ] as const;
    const storedPrincipal = makeDefaultStoredSessionPrincipal({
      assignments,
    });
    const { loadSession } = makeSubject({
      store: { principal: storedPrincipal },
    });

    const actual = await loadSession({ bearerToken: bearer });

    const value = expectOk(actual);
    expect(value.principalAttributes.assignments).toEqual(assignments);
    expect(value.principalAttributes.assignments).not.toBe(
      storedPrincipal.assignments,
    );
  });

  it('projects the optional Customer audience through session hydration', async () => {
    const customerId = '30000000-0000-4000-8000-000000000001';
    const { loadSession } = makeSubject({
      store: {
        principal: makeDefaultStoredSessionPrincipal({ customerId }),
      },
    });

    const value = expectOk(await loadSession({ bearerToken: bearer }));
    expect(value.principal).toMatchObject({
      audience: 'customer',
      customerId,
    });
  });

  it('loads service principals', async () => {
    const { email: _email, ...servicePrincipal } =
      makeDefaultStoredSessionPrincipal({
        kind: 'service',
        displayName: 'Background Worker',
        assignments: [],
      });
    const { loadSession } = makeSubject({
      store: { principal: servicePrincipal },
    });

    const actual = await loadSession({ bearerToken: bearer });

    const value = expectOk(actual);
    expect(value.principal).toMatchObject({
      kind: 'service',
      displayName: 'Background Worker',
    });
    expect(value.principalAttributes.assignments).toEqual([]);
    expect('email' in value.principal).toBe(false);
  });
});

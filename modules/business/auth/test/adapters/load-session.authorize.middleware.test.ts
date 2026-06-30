import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@pressly/auth/authentication';
import {
  allow,
  freshSession,
  globalScope,
  hasScopedRole,
  type Action,
  type AuthResource,
  type PolicyRule,
  type PrincipalAttributes,
  type Role,
} from '@pressly/auth/authorization';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeAuthorizeMiddleware } from '../../src/adapters/load-session/http/authorize.middleware.ts';
import type { AuthLocals } from '../../src/adapters/load-session/http/authenticate.middleware.ts';

const loadSessionResult: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Admin User',
  email: 'admin@pressly.com',
  sessionId: '22222222-2222-4222-8222-222222222222',
  sessionIssuedAt: new Date('2026-05-29T12:00:00.000Z'),
  sessionExpiresAt: new Date('2026-05-30T12:30:00.000Z'),
};

const routeResource: AuthResource = {
  kind: 'http.route',
  id: 'pricing:publish',
  scope: globalScope(),
};

type TestResponse = ReturnType<typeof makeHttpResponse> & {
  locals: Record<string, unknown>;
};

const makeResponse = (auth?: AuthLocals): TestResponse => {
  const response = Object.assign(makeHttpResponse(), {
    locals: {} as Record<string, unknown>,
  });

  if (auth !== undefined) response.locals['auth'] = auth;

  return response;
};

const makeRequest = (
  input: Readonly<{ ip?: string; userAgent?: string }> = {},
): Request =>
  ({
    ip: input.ip,
    header: vi.fn((name: string) =>
      name.toLowerCase() === 'user-agent' ? input.userAgent : undefined,
    ),
  }) as unknown as Request;

const readRouteResource = (): AuthResource => routeResource;

const allowPolicy = (
  input: Readonly<{
    id: string;
    action: Action;
    roles: readonly Role[];
    freshSessionMaxAgeMinutes?: number;
  }>,
): PolicyRule[] => [
  allow({
    id: input.id,
    action: input.action,
    when:
      input.freshSessionMaxAgeMinutes === undefined
        ? [hasScopedRole(input.roles)]
        : [
            hasScopedRole(input.roles),
            freshSession(input.freshSessionMaxAgeMinutes),
          ],
  }),
];

const makeAuthLocals = (
  input: Readonly<{
    principal?: Principal;
    role?: Role;
    principalAttributes?: PrincipalAttributes;
  }> = {},
): AuthLocals => {
  const principal = input.principal ?? loadSessionResult;
  const role = input.role ?? 'admin';

  return {
    principal,
    principalAttributes: input.principalAttributes ?? {
      assignments: [{ role, scope: globalScope() }],
      identityActive: true,
    },
  };
};

const runHandler = async (input: {
  handler: RequestHandler;
  req: Request;
  res: TestResponse;
  next: ReturnType<typeof vi.fn>;
}): Promise<void> => {
  input.handler(
    input.req,
    input.res as unknown as Response,
    input.next as NextFunction,
  );
  await waitForController();
  await waitForController();
};

const expectNextErrorCode = (
  next: ReturnType<typeof vi.fn>,
  code: string,
): void => {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ code });
};

describe('authorize middleware', () => {
  it('allows an authenticated principal with the required role assignment', async () => {
    const readResource = vi.fn(readRouteResource);

    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
        freshSessionMaxAgeMinutes: 10,
      }),
      readResource,
    });

    const principal = {
      ...loadSessionResult,
      sessionIssuedAt: new Date(),
    } satisfies Principal;

    const req = makeRequest({ ip: '127.0.0.1', userAgent: 'vitest' });
    const res = makeResponse(makeAuthLocals({ principal }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expect(next.mock.calls).toEqual([[]]);
    expect(readResource).toHaveBeenCalledWith(req, res);
    expect(res.locals['authorization']).toEqual({
      action: 'pricing:publish',
      resource: routeResource,
      decision: {
        tag: 'allowed',
        policyId: 'pricing.publish.admin',
      },
    });
  });

  it('requires authenticate middleware to run first', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
      }),
      readResource: readRouteResource,
    });

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'missing_auth_context');
  });

  it('denies principals without one of the allowed roles', async () => {
    const emit = vi.fn();
    const authorize = makeAuthorizeMiddleware({ emit })({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.owner',
        action: 'pricing:publish',
        roles: ['owner'],
      }),
      readResource: readRouteResource,
    });

    const req = makeRequest();
    const res = makeResponse(makeAuthLocals({ role: 'admin' }));
    res.locals['requestId'] = 'request-1';
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'missing_assignment');
    expect(emit).toHaveBeenCalledWith({
      name: 'authorization.denied',
      occurredAt: expect.any(String),
      outcome: 'denied',
      requestId: 'request-1',
      principalId: loadSessionResult.identityId,
      sessionId: loadSessionResult.sessionId,
      action: 'pricing:publish',
      resourceType: 'http.route',
      resourceId: 'pricing:publish',
      reason: 'missing_assignment',
    });
  });

  it('allows any configured action when the required role assignment matches', async () => {
    const resource: AuthResource = {
      kind: 'http.route',
      id: 'auth:user:manage',
      scope: globalScope(),
    };
    const authorize = makeAuthorizeMiddleware()({
      action: 'auth:user:manage',
      policies: allowPolicy({
        id: 'auth.user.manage.admin',
        action: 'auth:user:manage',
        roles: ['admin'],
      }),
      readResource: () => resource,
    });
    const req = makeRequest();
    const res = makeResponse(makeAuthLocals({ role: 'admin' }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expect(next.mock.calls).toEqual([[]]);
  });

  it('denies stale sessions when a fresh session is required', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
        freshSessionMaxAgeMinutes: 10,
      }),
      readResource: readRouteResource,
    });
    const stalePrincipal = {
      ...loadSessionResult,
      sessionIssuedAt: new Date('2026-01-01T00:00:00.000Z'),
    } satisfies Principal;
    const req = makeRequest();
    const res = makeResponse(makeAuthLocals({ principal: stalePrincipal }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'stale_session');
  });
});

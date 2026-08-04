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
import type { SecurityEventSink } from '@pressly/logging';
import { makeAuthorizeMiddleware } from '../../../../src/foundations/adapters/http/authentication-request/authorize-request.adapter.ts';
import type { AuthHttpContext as AuthLocals } from '../../../../src/foundations/adapters/http/authentication-request/auth-context.adapter.ts';

const loadSessionResult: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Admin User',
  email: 'admin@pressly.com',
  sessionId: '22222222-2222-4222-8222-222222222222',
  sessionIssuedAt: new Date('2026-05-29T12:00:00.000Z'),
  sessionExpiresAt: new Date('2026-05-30T12:30:00.000Z'),
};

const authorizationNow = new Date('2026-05-29T12:05:00.000Z');
const clock = { now: () => new Date(authorizationNow) };
const makeAuthorize = (securityEvents?: SecurityEventSink) =>
  makeAuthorizeMiddleware({
    clock,
    ...(securityEvents === undefined ? {} : { securityEvents }),
  });

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

    const authorize = makeAuthorize()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
        freshSessionMaxAgeMinutes: 10,
      }),
      readResource,
    });

    const req = makeRequest({ ip: '127.0.0.1', userAgent: 'vitest' });
    const res = makeResponse(makeAuthLocals());
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

  it('awaits asynchronous resource resolution before authorizing', async () => {
    const deferred: {
      resolve?: (resource: AuthResource) => void;
    } = {};
    const readResource = vi.fn(
      () =>
        new Promise<AuthResource>((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    const authorize = makeAuthorize()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
      }),
      readResource,
    });
    const req = makeRequest();
    const res = makeResponse(makeAuthLocals());
    const next = vi.fn();

    authorize(req, res as unknown as Response, next as NextFunction);
    await waitForController();

    expect(readResource).toHaveBeenCalledWith(req, res);
    expect(next).not.toHaveBeenCalled();
    expect(res.locals['authorization']).toBeUndefined();

    deferred.resolve?.(routeResource);
    await waitForController();
    await waitForController();

    expect(next.mock.calls).toEqual([[]]);
    expect(res.locals['authorization']).toMatchObject({
      action: 'pricing:publish',
      resource: routeResource,
      decision: { tag: 'allowed' },
    });
  });

  it('propagates canonical resource resolver failures unchanged', async () => {
    const resolverError = Object.assign(
      new Error('Location ancestry could not be resolved.'),
      { code: 'location_ancestry_missing' },
    );
    const readResource = vi.fn(async () => {
      throw resolverError;
    });
    const authorize = makeAuthorize()({
      action: 'pricing:publish',
      policies: allowPolicy({
        id: 'pricing.publish.admin',
        action: 'pricing:publish',
        roles: ['admin'],
      }),
      readResource,
    });
    const req = makeRequest();
    const res = makeResponse(makeAuthLocals());
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expect(next).toHaveBeenCalledWith(resolverError);
    expect(res.locals['authorization']).toBeUndefined();
  });

  it('requires authenticate middleware to run first', async () => {
    const authorize = makeAuthorize()({
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
    const authorize = makeAuthorize({ emit })({
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
    const authorize = makeAuthorize()({
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
    const authorize = makeAuthorize()({
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

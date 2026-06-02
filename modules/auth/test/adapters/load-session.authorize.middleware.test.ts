import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  actorFromPrincipal,
  type Actor,
  type Principal,
  type Role,
} from '@pressly/auth';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeAuthorizeMiddleware } from '../../src/adapters/load-session/http/authorize.middleware.ts';

const loadSessionResult: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Admin User',
  email: 'admin@pressly.com',
  roles: ['admin'],
  sessionId: '22222222-2222-4222-8222-222222222222',
  sessionIssuedAt: new Date('2026-05-29T12:00:00.000Z'),
  sessionExpiresAt: new Date('2026-05-30T12:30:00.000Z'),
};

type TestResponse = ReturnType<typeof makeHttpResponse> & {
  locals: Record<string, unknown>;
};

type AuthLocals = Readonly<{ principal: Principal; actor: Actor }>;

const makeResponse = (auth?: AuthLocals): TestResponse => {
  const response = Object.assign(makeHttpResponse(), {
    locals: {} as Record<string, unknown>,
  });

  if (auth !== undefined) response.locals['auth'] = auth;

  return response;
};

const makeAuthLocals = (
  input: Readonly<{
    principal?: Principal;
    role?: Role;
  }> = {},
): AuthLocals => {
  const principal = input.principal ?? loadSessionResult;
  const role = input.role ?? 'admin';

  return {
    principal,
    actor: actorFromPrincipal({ principal, role }),
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
  it('allows an authenticated actor with the required role and permission', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      roles: ['admin'],
      freshSessionMaxAgeMinutes: 10,
    });
    const principal = {
      ...loadSessionResult,
      sessionIssuedAt: new Date(),
    } satisfies Principal;
    const req = {} as Request;
    const res = makeResponse(makeAuthLocals({ principal }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expect(next.mock.calls).toEqual([[]]);
  });

  it('requires authenticate middleware to run first', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      roles: ['admin'],
    });
    const req = {} as Request;
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'missing_auth_context');
  });

  it('denies actors without one of the allowed roles', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      roles: ['owner'],
    });
    const req = {} as Request;
    const res = makeResponse(makeAuthLocals({ role: 'admin' }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'missing_role');
  });

  it('denies actors missing the action permission', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'auth:user:manage',
      roles: ['admin'],
    });
    const req = {} as Request;
    const res = makeResponse(makeAuthLocals({ role: 'admin' }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'missing_permission');
  });

  it('denies stale sessions when a fresh session is required', async () => {
    const authorize = makeAuthorizeMiddleware()({
      action: 'pricing:publish',
      roles: ['admin'],
      freshSessionMaxAgeMinutes: 10,
    });
    const stalePrincipal = {
      ...loadSessionResult,
      sessionIssuedAt: new Date('2026-01-01T00:00:00.000Z'),
    } satisfies Principal;
    const req = {} as Request;
    const res = makeResponse(makeAuthLocals({ principal: stalePrincipal }));
    const next = vi.fn();

    await runHandler({ handler: authorize, req, res, next });

    expectNextErrorCode(next, 'stale_session');
  });
});

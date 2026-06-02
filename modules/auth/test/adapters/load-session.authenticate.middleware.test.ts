import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@pressly/auth';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeAuthenticateMiddleware } from '../../src/adapters/load-session/http/authenticate.middleware.ts';
import type { LoadSession } from '../../src/features/load-session/load-session.usecase.ts';

const bearerToken = 'access-token-with-at-least-thirty-two-chars';

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

type MakeLoadSessionRequestInput = Readonly<{
  bearerToken?: string;
  authorization?: string | undefined;
}>;

const makeLoadSessionRequest = (
  input: MakeLoadSessionRequestInput = {},
): { req: Request; header: ReturnType<typeof vi.fn> } => {
  const authorization =
    'authorization' in input
      ? input.authorization
      : `Bearer ${input.bearerToken ?? bearerToken}`;
  const header = vi.fn((name: string) =>
    name.toLowerCase() === 'authorization' ? authorization : undefined,
  );

  return {
    req: { header } as unknown as Request,
    header,
  };
};

const makeResponse = (): TestResponse =>
  Object.assign(makeHttpResponse(), {
    locals: {} as Record<string, unknown>,
  });

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

const invalidSessionError = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'invalid_session',
    message: 'Session token was not found.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

const expectNextErrorCode = (
  next: ReturnType<typeof vi.fn>,
  code: string,
): void => {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ code });
};

describe('authenticate middleware', () => {
  it('loads the bearer session and writes auth locals', async () => {
    const principal = {
      ...loadSessionResult,
      roles: ['operator', 'admin'],
    } satisfies Principal;
    const loadSession = vi.fn<LoadSession>().mockResolvedValue(ok(principal));
    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req, header } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(header).toHaveBeenCalledWith('authorization');
    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.locals['auth']).toEqual({
      principal,
      actor: expect.objectContaining({
        id: principal.identityId,
        kind: 'human',
        displayName: 'Admin User',
        role: 'admin',
        permissions: expect.arrayContaining(['pricing:publish']),
      }),
    });
    expect(next.mock.calls).toEqual([[]]);
  });

  it('forwards missing bearer headers before loading a session', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(loadSessionResult));
    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req } = makeLoadSessionRequest({ authorization: undefined });
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(loadSession).not.toHaveBeenCalled();
    expect(res.locals['auth']).toBeUndefined();
    expectNextErrorCode(next, 'missing_bearer_token');
  });

  it('forwards load session failures to express', async () => {
    const error = invalidSessionError();
    const loadSession = vi.fn<LoadSession>().mockResolvedValue(err(error));
    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(next).toHaveBeenCalledWith(error);
    expect(res.locals['auth']).toBeUndefined();
  });

  it('requires a usable role before writing auth locals', async () => {
    const principal = { ...loadSessionResult, roles: [] } satisfies Principal;
    const loadSession = vi.fn<LoadSession>().mockResolvedValue(ok(principal));
    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.locals['auth']).toBeUndefined();
    expectNextErrorCode(next, 'missing_role');
  });
});

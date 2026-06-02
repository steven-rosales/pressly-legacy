import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@pressly/auth';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeLoadSessionController } from '../../src/adapters/load-session/http/load-session.controller.ts';
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

type TestResponse = ReturnType<typeof makeHttpResponse>;

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

describe('load session http controller', () => {
  it('returns a success envelope with a public principal and expiry', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(loadSessionResult));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req, header } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(header).toHaveBeenCalledWith('authorization');
    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        principal: {
          identityId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Admin User',
          email: 'admin@pressly.com',
          roles: ['admin'],
        },
        expiresAt: '2026-05-30T12:30:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('omits email from the response when the principal has no email', async () => {
    const { email: _email, ...principalWithoutEmail } = loadSessionResult;
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(principalWithoutEmail));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        principal: {
          identityId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Admin User',
          roles: ['admin'],
        },
        expiresAt: '2026-05-30T12:30:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a failure envelope from load session errors', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(err(invalidSessionError()));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'invalid_session',
        message: 'Authentication is required.',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards missing bearer headers to express', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(loadSessionResult));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest({ authorization: undefined });
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(loadSession).not.toHaveBeenCalled();
    expectNextErrorCode(next, 'missing_bearer_token');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards malformed bearer headers to express', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(loadSessionResult));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest({ authorization: 'Bearer   ' });
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(loadSession).not.toHaveBeenCalled();
    expectNextErrorCode(next, 'missing_bearer_token');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards unexpected async errors to express', async () => {
    const error = new Error('load session dependency failed');
    const loadSession = vi.fn<LoadSession>().mockRejectedValue(error);
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards loaded principals missing session expiry as invariant errors', async () => {
    const { sessionExpiresAt: _sessionExpiresAt, ...principalWithoutExpiry } =
      loadSessionResult;
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(ok(principalWithoutExpiry));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expectNextErrorCode(next, 'loaded_session_missing_expiry');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

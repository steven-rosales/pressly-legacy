import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { LogoutResult } from '@pressly/contracts';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeRevokeSessionController } from '../../src/adapters/revoke-session/http/revoke-session.controller.ts';
import { makeRevokeSessionRouter } from '../../src/adapters/revoke-session/http/revoke-session.route.ts';
import type { RevokeSession } from '../../src/features/revoke-session/revoke-session.usecase.ts';

const bearerToken = 'access-token-with-at-least-thirty-two-chars';
const logoutResult: LogoutResult = { revoked: true };

type TestResponse = ReturnType<typeof makeHttpResponse>;

type MakeRevokeSessionRequestInput = Readonly<{
  bearerToken?: string;
  authorization?: string | undefined;
}>;

const makeRevokeSessionRequest = (
  input: MakeRevokeSessionRequestInput = {},
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

describe('revoke session http controller', () => {
  it('returns a success envelope for logout results', async () => {
    const revokeSession = vi
      .fn<RevokeSession>()
      .mockResolvedValue(ok(logoutResult));
    const revokeSessionController = makeRevokeSessionController(revokeSession);
    const { req, header } = makeRevokeSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: revokeSessionController, req, res, next });

    expect(header).toHaveBeenCalledWith('authorization');
    expect(revokeSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: logoutResult,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a failure envelope from revoke session errors', async () => {
    const revokeSession = vi
      .fn<RevokeSession>()
      .mockResolvedValue(err(invalidSessionError()));
    const revokeSessionController = makeRevokeSessionController(revokeSession);
    const { req } = makeRevokeSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: revokeSessionController, req, res, next });

    expect(revokeSession).toHaveBeenCalledWith({ bearerToken });
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
    const revokeSession = vi
      .fn<RevokeSession>()
      .mockResolvedValue(ok(logoutResult));
    const revokeSessionController = makeRevokeSessionController(revokeSession);
    const { req } = makeRevokeSessionRequest({ authorization: undefined });
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: revokeSessionController, req, res, next });

    expect(revokeSession).not.toHaveBeenCalled();
    expectNextErrorCode(next, 'missing_bearer_token');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards malformed bearer headers to express', async () => {
    const revokeSession = vi
      .fn<RevokeSession>()
      .mockResolvedValue(ok(logoutResult));
    const revokeSessionController = makeRevokeSessionController(revokeSession);
    const { req } = makeRevokeSessionRequest({ authorization: 'Basic token' });
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: revokeSessionController, req, res, next });

    expect(revokeSession).not.toHaveBeenCalled();
    expectNextErrorCode(next, 'missing_bearer_token');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards unexpected async errors to express', async () => {
    const error = new Error('revoke session dependency failed');
    const revokeSession = vi.fn<RevokeSession>().mockRejectedValue(error);
    const revokeSessionController = makeRevokeSessionController(revokeSession);
    const { req } = makeRevokeSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: revokeSessionController, req, res, next });

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('revoke session http router', () => {
  it('registers POST / for the revoke session controller', () => {
    const revokeSession = vi
      .fn<RevokeSession>()
      .mockResolvedValue(ok(logoutResult));
    const router = makeRevokeSessionRouter({ revokeSession }) as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: unknown[];
        };
      }>;
    };

    expect(router.stack).toHaveLength(1);
    expect(router.stack[0]?.route).toMatchObject({
      path: '/',
      methods: { post: true },
    });
    expect(router.stack[0]?.route?.stack).toHaveLength(1);
  });
});

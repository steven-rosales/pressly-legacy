import { result } from '@pressly/kernel';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { globalScope } from '@pressly/auth/authorization';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeLoadSessionController } from '../../../../src/features/sessions/load-session/load-session.controller.ts';
import { makeLoadSessionRouter } from '../../../../src/features/sessions/load-session/load-session.route.ts';
import { loadSessionFailure } from '../../../../src/features/sessions/load-session/load-session.failure.ts';
import { toLoadSessionHttpError } from '../../../../src/features/sessions/load-session/load-session.contract.mapper.ts';
import type { LoadedSession } from '../../../../src/features/sessions/load-session/load-session.model.ts';
import type { LoadSession } from '../../../../src/features/sessions/load-session/load-session.usecase.ts';

const bearerToken = 'access-token-with-at-least-thirty-two-chars';

const loadSessionResult: LoadedSession = {
  principal: {
    identityId: '11111111-1111-4111-8111-111111111111',
    kind: 'human',
    displayName: 'Admin User',
    email: 'admin@pressly.com',
    sessionId: '22222222-2222-4222-8222-222222222222',
    sessionIssuedAt: new Date('2026-05-29T12:00:00.000Z'),
    sessionExpiresAt: new Date('2026-05-30T12:30:00.000Z'),
  },
  principalAttributes: {
    assignments: [{ role: 'admin', scope: globalScope() }],
    identityActive: true,
  },
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
  toLoadSessionHttpError(loadSessionFailure.invalid());

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
      .mockResolvedValue(result.ok(loadSessionResult));
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
    const { email: _email, ...principalWithoutEmail } =
      loadSessionResult.principal;
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(
        result.ok({ ...loadSessionResult, principal: principalWithoutEmail }),
      );
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

  it('forwards load-session application errors to express', async () => {
    const error = invalidSessionError();
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.err(loadSessionFailure.invalid()));
    const loadSessionController = makeLoadSessionController(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeHttpResponse();
    const next = vi.fn();

    await runHandler({ handler: loadSessionController, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards missing bearer headers to express', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.ok(loadSessionResult));
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
      .mockResolvedValue(result.ok(loadSessionResult));
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
      loadSessionResult.principal;
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(
        result.ok({ ...loadSessionResult, principal: principalWithoutExpiry }),
      );
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

describe('load session http router', () => {
  it('registers GET / for the load session controller', () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.ok(loadSessionResult));
    const router = makeLoadSessionRouter({ loadSession }) as unknown as {
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
      methods: { get: true },
    });
    expect(router.stack[0]?.route?.stack).toHaveLength(1);
  });
});

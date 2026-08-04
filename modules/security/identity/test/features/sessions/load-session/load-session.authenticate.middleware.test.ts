import { result } from '@pressly/kernel';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { globalScope } from '@pressly/auth/authorization';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeAuthenticateMiddleware } from '../../../../src/features/sessions/load-session/authenticate.middleware.ts';
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
  toLoadSessionHttpError(loadSessionFailure.invalid());

const expectNextErrorCode = (
  next: ReturnType<typeof vi.fn>,
  code: string,
): void => {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ code });
};

describe('authenticate middleware', () => {
  it('loads the bearer session and writes auth locals', async () => {
    const loadedSession = {
      ...loadSessionResult,
      principalAttributes: {
        assignments: [
          { role: 'operator', scope: globalScope() },
          { role: 'admin', scope: globalScope() },
        ],
        identityActive: true,
      },
    } satisfies LoadedSession;

    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.ok(loadedSession));

    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req, header } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(header).toHaveBeenCalledWith('authorization');
    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.locals['auth']).toEqual(loadedSession);
    expect(next.mock.calls).toEqual([[]]);
  });

  it('forwards missing bearer headers before loading a session', async () => {
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.ok(loadSessionResult));

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
    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.err(loadSessionFailure.invalid()));

    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(next).toHaveBeenCalledWith(error);
    expect(res.locals['auth']).toBeUndefined();
  });

  it('does not require authorization assignments before writing auth locals', async () => {
    const loadedSession = {
      ...loadSessionResult,
      principalAttributes: { assignments: [], identityActive: true },
    } satisfies LoadedSession;

    const loadSession = vi
      .fn<LoadSession>()
      .mockResolvedValue(result.ok(loadedSession));

    const authenticate = makeAuthenticateMiddleware(loadSession);
    const { req } = makeLoadSessionRequest();
    const res = makeResponse();
    const next = vi.fn();

    await runHandler({ handler: authenticate, req, res, next });

    expect(loadSession).toHaveBeenCalledWith({ bearerToken });
    expect(res.locals['auth']).toEqual(loadedSession);
    expect(next.mock.calls).toEqual([[]]);
  });
});

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { LoginResult } from '@pressly/contracts';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeLoginController } from '../../src/adapters/login/http/login.controller.ts';
import { makeLoginRoute } from '../../src/adapters/login/http/login.route.ts';
import type { Login } from '../../src/features/login/login.usecase.ts';

const loginResult: LoginResult = {
  accessToken: 'access-token-with-at-least-thirty-two-chars',
  expiresAt: '2026-05-29T12:30:00.000Z',
  principal: {
    identityId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin User',
    email: 'admin@pressly.com',
    roles: ['admin'],
  },
};

const makeLoginRequest = (input?: {
  email?: string;
  password?: string;
  ipAddress?: string;
  userAgent?: string;
}): { req: Request; header: ReturnType<typeof vi.fn> } => {
  const header = vi.fn((name: string) =>
    name.toLowerCase() === 'user-agent' ? input?.userAgent : undefined,
  );

  return {
    req: {
      body: {
        email: input?.email ?? 'admin@pressly.com',
        password: input?.password ?? 'MyStrong@0000',
      },
      ...(input?.ipAddress === undefined ? {} : { ip: input.ipAddress }),
      header,
    } as unknown as Request,
    header,
  };
};

describe('login http controller', () => {
  it('returns a success envelope for login results', async () => {
    const login = vi.fn<Login>().mockResolvedValue(ok(loginResult));

    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    loginController(req, res as unknown as Response, next);
    await waitForController();

    expect(login).toHaveBeenCalledWith({
      email: 'admin@pressly.com',
      password: 'MyStrong@0000',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: loginResult,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes optional request metadata to the login use case', async () => {
    const login = vi.fn<Login>().mockResolvedValue(ok(loginResult));
    const loginController = makeLoginController(login);
    const { req, header } = makeLoginRequest({
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    loginController(req, res as unknown as Response, next);
    await waitForController();

    expect(login).toHaveBeenCalledWith({
      email: 'admin@pressly.com',
      password: 'MyStrong@0000',
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });
    expect(header).toHaveBeenCalledWith('user-agent');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a failure envelope from login errors', async () => {
    const error = makeAppError({
      kind: 'PermissionError',
      code: 'invalid_credentials',
      message: 'Internal credential details.',
      safeMessage: 'Invalid email or password.',
      status: 401,
    });
    const login = vi.fn<Login>().mockResolvedValue(err(error));
    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    loginController(req, res as unknown as Response, next);
    await waitForController();

    expect(login).toHaveBeenCalledWith({
      email: 'admin@pressly.com',
      password: 'MyStrong@0000',
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'invalid_credentials',
        message: 'Invalid email or password.',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected async errors to express', async () => {
    const error = new Error('login dependency failed');
    const login = vi.fn<Login>().mockRejectedValue(error);
    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    loginController(req, res as unknown as Response, next);
    await waitForController();
    await waitForController();

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('login http router', () => {
  it('registers POST / with validation and the login controller', () => {
    const login = vi.fn<Login>().mockResolvedValue(ok(loginResult));
    const router = makeLoginRoute(login) as unknown as {
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
    expect(router.stack[0]?.route?.stack).toHaveLength(2);
  });
});

import { result } from '@pressly/kernel';
import type { ValidatedController } from '@pressly/http/express';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { LoginResult } from '@pressly/contracts/auth';
import { makeHttpResponse } from '@pressly/testkit/http';
import { makeLoginController } from '../../../../src/features/sessions/login/login.controller.ts';
import { makeLoginRoute } from '../../../../src/features/sessions/login/login.route.ts';
import type { LoginOutcome } from '../../../../src/features/sessions/login/login.model.ts';
import { loginFailure } from '../../../../src/features/sessions/login/login.failure.ts';
import { toLoginHttpError } from '../../../../src/features/sessions/login/login.contract.mapper.ts';
import type { Login } from '../../../../src/features/sessions/login/login.usecase.ts';

const loginOutcome: LoginOutcome = {
  accessToken: 'access-token-with-at-least-thirty-two-chars',
  expiresAt: new Date('2026-05-29T12:30:00.000Z'),
  principal: {
    identityId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin User',
    email: 'admin@pressly.com',
    roles: ['admin'],
  },
};

const loginResult: LoginResult = {
  ...loginOutcome,
  expiresAt: loginOutcome.expiresAt.toISOString(),
  principal: {
    ...loginOutcome.principal,
    roles: [...loginOutcome.principal.roles],
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

const runLoginController = async (input: {
  controller: ValidatedController;
  req: Request;
  res: ReturnType<typeof makeHttpResponse>;
  next: NextFunction;
}): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    input.controller.validate(
      input.req,
      input.res as unknown as Response,
      (error?: unknown) => {
        if (error === undefined) resolve();
        else reject(error);
      },
    );
  });
  await input.controller.handle(
    input.req,
    input.res as unknown as Response,
    input.next,
  );
};

describe('login http controller', () => {
  it('returns a success envelope for login results', async () => {
    const login = vi.fn<Login>().mockResolvedValue(result.ok(loginOutcome));

    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await runLoginController({ controller: loginController, req, res, next });

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
    const login = vi.fn<Login>().mockResolvedValue(result.ok(loginOutcome));
    const loginController = makeLoginController(login);
    const { req, header } = makeLoginRequest({
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await runLoginController({ controller: loginController, req, res, next });

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

  it('serializes MFA challenge expiry at the HTTP edge', async () => {
    const login = vi.fn<Login>().mockResolvedValue(
      result.ok({
        status: 'mfa_required',
        challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
        expiresAt: new Date('2026-05-29T12:05:00.000Z'),
      }),
    );
    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await runLoginController({ controller: loginController, req, res, next });

    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        status: 'mfa_required',
        challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
        expiresAt: '2026-05-29T12:05:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards login application errors to express', async () => {
    const failure = loginFailure.invalidCredentials();
    const error = toLoginHttpError(failure);
    const login = vi.fn<Login>().mockResolvedValue(result.err(failure));
    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await expect(
      runLoginController({ controller: loginController, req, res, next }),
    ).rejects.toMatchObject(error);

    expect(login).toHaveBeenCalledWith({
      email: 'admin@pressly.com',
      password: 'MyStrong@0000',
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards unexpected async errors to express', async () => {
    const error = new Error('login dependency failed');
    const login = vi.fn<Login>().mockRejectedValue(error);
    const loginController = makeLoginController(login);
    const { req } = makeLoginRequest();
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await expect(
      runLoginController({ controller: loginController, req, res, next }),
    ).rejects.toBe(error);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('login http router', () => {
  it('registers POST / with validation and the login controller', () => {
    const login = vi.fn<Login>().mockResolvedValue(result.ok(loginOutcome));
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

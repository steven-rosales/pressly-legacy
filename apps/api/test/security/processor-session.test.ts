import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AuthModule } from '@pressly/auth-module';
import { isAppError } from '@pressly/errors';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveProcessorCsrfToken,
  makeProcessorBrowserBoundary,
  processorCookieNames,
} from '../../src/http/processor/session/processor-session.boundary.ts';

const origin = 'http://processor.test';
const csrfSecret = 'test-processor-csrf-secret-at-least-32-bytes';
const sessionToken = 'opaque-session-token-at-least-32-characters';
const challengeToken = 'opaque-challenge-token-at-least-32-characters';
const expiresAt = '2026-08-01T20:00:00.000Z';
const principal = {
  identityId: '00000000-0000-4000-8000-000000000001',
  displayName: 'Operator One',
  email: 'operator@example.com',
  roles: ['operator' as const],
};

const loadedSession = {
  principal: {
    identityId: principal.identityId,
    kind: 'human' as const,
    displayName: principal.displayName,
    email: principal.email,
    sessionId: '00000000-0000-4000-8000-000000000002',
    sessionIssuedAt: new Date('2026-08-01T14:00:00.000Z'),
    sessionExpiresAt: new Date(expiresAt),
  },
  principalAttributes: {
    identityActive: true,
    assuranceLevel: 'password' as const,
    assignments: [
      { role: 'operator' as const, scope: { kind: 'global' as const } },
    ],
  },
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (isAppError(error)) {
    response.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.safeMessage },
    });
    return;
  }
  response.status(500).json({
    ok: false,
    error: { code: 'unexpected', message: 'Unexpected error.' },
  });
};

const makeApplication = (
  input: {
    loginValue?:
      | {
          accessToken: string;
          expiresAt: string;
          principal: typeof principal;
        }
      | { status: 'mfa_required'; challengeToken: string; expiresAt: string };
  } = {},
) => {
  const application = {
    login: vi.fn(async () => ({
      tag: 'ok' as const,
      value:
        input.loginValue ??
        ({ accessToken: sessionToken, expiresAt, principal } as const),
    })),
    loadSession: vi.fn(async () => ({
      tag: 'ok' as const,
      value: loadedSession,
    })),
    revokeSession: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { revoked: true as const },
    })),
    completeMfaChallenge: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { accessToken: sessionToken, expiresAt, principal },
    })),
  } as unknown as AuthModule['application'];
  return application;
};

const makeTestApp = (input: {
  application: AuthModule['application'];
  secureCookies?: boolean;
}) => {
  const bearerAuthenticate = vi.fn<RequestHandler>(
    (_request, response, next) => {
      response.locals['auth'] = loadedSession;
      next();
    },
  );
  const boundary = makeProcessorBrowserBoundary({
    application: input.application,
    bearerAuthenticate,
    options: {
      origin,
      csrfSecret,
      secureCookies: input.secureCookies ?? false,
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/processor/auth', boundary.routes);
  app.post('/unsafe', boundary.authenticate, (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return { app, bearerAuthenticate };
};

const cookieValue = (setCookie: string, name: string): string => {
  const match = setCookie.match(new RegExp(`${name}=([^;,]+)`));
  if (match?.[1] === undefined) throw new Error(`Missing cookie ${name}.`);
  return decodeURIComponent(match[1]);
};

describe('processor browser session boundary', () => {
  it('keeps the opaque session in an HttpOnly Strict cookie and returns only a CSRF proof', async () => {
    const application = makeApplication();
    const { app } = makeTestApp({ application });
    const baseUrl = await start(app);

    const response = await fetch(`${baseUrl}/processor/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: principal.email,
        password: 'correct-horse-battery',
      }),
    });
    const body = (await response.json()) as { data: Record<string, unknown> };
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      status: 'authenticated',
      principal,
      csrfToken: deriveProcessorCsrfToken(sessionToken, csrfSecret),
    });
    expect(JSON.stringify(body)).not.toMatch(/accessToken|challengeToken/);
    expect(setCookie).toContain('pressly_processor_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');
    expect(cookieValue(setCookie, 'pressly_processor_session')).toBe(
      sessionToken,
    );
  });

  it('restores and revokes the cookie session while enforcing origin plus CSRF on unsafe requests', async () => {
    const application = makeApplication();
    const { app } = makeTestApp({ application });
    const baseUrl = await start(app);
    const cookie = `pressly_processor_session=${sessionToken}`;
    const csrf = deriveProcessorCsrfToken(sessionToken, csrfSecret);

    const restored = await fetch(`${baseUrl}/processor/auth/session`, {
      headers: { Cookie: cookie },
    });
    expect(restored.status).toBe(200);
    expect(application.loadSession).toHaveBeenCalledWith({
      bearerToken: sessionToken,
    });

    const missingProof = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(missingProof.status).toBe(403);

    const accepted = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'X-CSRF-Token': csrf,
      },
    });
    expect(accepted.status).toBe(200);

    const logout = await fetch(`${baseUrl}/processor/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'X-CSRF-Token': csrf,
      },
    });
    expect(logout.status).toBe(200);
    expect(application.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: sessionToken }),
    );
    expect(logout.headers.get('set-cookie')).toContain(
      'pressly_processor_session=',
    );
  });

  it('keeps bearer clients compatible without applying browser CSRF checks', async () => {
    const application = makeApplication();
    const { app, bearerAuthenticate } = makeTestApp({ application });
    const baseUrl = await start(app);

    const response = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: { Authorization: 'Bearer service-session-token' },
    });

    expect(response.status).toBe(200);
    expect(bearerAuthenticate).toHaveBeenCalledOnce();
    expect(application.loadSession).not.toHaveBeenCalled();
  });

  it('keeps the MFA challenge in its own HttpOnly cookie and never returns it to JavaScript', async () => {
    const application = makeApplication({
      loginValue: { status: 'mfa_required', challengeToken, expiresAt },
    });
    const { app } = makeTestApp({ application });
    const baseUrl = await start(app);

    const login = await fetch(`${baseUrl}/processor/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: principal.email,
        password: 'correct-horse-battery',
      }),
    });
    const loginCookie = login.headers.get('set-cookie') ?? '';
    const loginBody = await login.text();
    expect(loginBody).not.toContain(challengeToken);
    expect(loginCookie).toContain('pressly_processor_mfa=');

    const completed = await fetch(`${baseUrl}/processor/auth/mfa/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: `pressly_processor_mfa=${challengeToken}`,
      },
      body: JSON.stringify({ method: 'totp', code: '123456' }),
    });
    expect(completed.status).toBe(200);
    expect(application.completeMfaChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeToken,
        method: 'totp',
        code: '123456',
      }),
    );
    expect(await completed.text()).not.toContain(sessionToken);
  });

  it('uses __Host cookies with Secure, Strict, and root-path semantics in production', async () => {
    const application = makeApplication();
    const { app } = makeTestApp({ application, secureCookies: true });
    const baseUrl = await start(app);
    const response = await fetch(`${baseUrl}/processor/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: principal.email,
        password: 'correct-horse-battery',
      }),
    });
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(processorCookieNames(true).session).toBe(
      '__Host-pressly-processor-session',
    );
    expect(setCookie).toContain('__Host-pressly-processor-session=');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');
  });
});

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IdentityModule } from '@pressly/identity';
import type { ControlAccess } from '@pressly/control-experience';
import { isAppError } from '@pressly/errors/app-error';
import express, { type ErrorRequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlCookieNames } from '../../src/http/control/session/control-cookie.adapter.ts';
import { deriveControlCsrfToken } from '../../src/http/control/session/control-csrf.adapter.ts';
import { makeControlSessionAuthentication } from '../../src/http/control/session/control-session.middleware.ts';
import { makeControlSessionRoutes } from '../../src/http/control/session/control-session.route.ts';
import type {
  ControlAuthApplication,
  ControlSessionOptions,
  ResolveControlAccess,
} from '../../src/http/control/session/control-session.port.ts';

const origin = 'http://control.test';
const csrfSecret = 'test-control-csrf-secret-at-least-32-bytes';
const sessionToken = 'opaque-session-token-at-least-32-characters';
const challengeToken = 'opaque-challenge-token-at-least-32-characters';
const expiresAt = '2026-08-01T20:00:00.000Z';
const expiresAtDate = new Date(expiresAt);
const options: ControlSessionOptions = {
  origin,
  csrfSecret,
  secureCookies: false,
  processorOrigin: 'http://processor.test',
};
const loadedSession = {
  principal: {
    identityId: '00000000-0000-4000-8000-000000000001',
    kind: 'human' as const,
    displayName: 'Manager One',
    email: 'manager@example.com',
    sessionId: '00000000-0000-4000-8000-000000000002',
    sessionIssuedAt: new Date('2026-08-01T14:00:00.000Z'),
    sessionExpiresAt: new Date(expiresAt),
  },
  principalAttributes: {
    identityActive: true,
    assuranceLevel: 'mfa' as const,
    assignments: [],
  },
};
const controlAccess: ControlAccess = {
  business: {
    id: '00000000-0000-4000-8000-000000000100',
    name: 'Pressly One',
  },
  locations: [
    {
      id: 'laundry-1',
      name: 'Laundry Production',
      timezone: 'America/New_York',
    },
  ],
  selectedLocationId: 'laundry-1',
  capabilities: ['control:view', 'team:read', 'team:write', 'processor:view'],
  applications: [
    {
      id: 'control',
      label: 'Pressly Control',
      description: 'Manage the business.',
      href: origin,
    },
    {
      id: 'processor',
      label: 'Pressly Processor',
      description: 'Run floor production.',
      href: 'http://processor.test',
    },
  ],
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
          expiresAt: Date;
          principal: {
            identityId: string;
            displayName: string;
            email: string;
            roles: ['manager'];
          };
        }
      | { status: 'mfa_required'; challengeToken: string; expiresAt: Date };
  } = {},
): ControlAuthApplication =>
  ({
    login: vi.fn(async () => ({
      tag: 'ok' as const,
      value:
        input.loginValue ??
        ({
          accessToken: sessionToken,
          expiresAt: expiresAtDate,
          principal: {
            identityId: loadedSession.principal.identityId,
            displayName: loadedSession.principal.displayName,
            email: loadedSession.principal.email,
            roles: ['manager'] as const,
          },
        } as const),
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
      value: {
        accessToken: sessionToken,
        expiresAt: expiresAtDate,
        principal: {
          identityId: loadedSession.principal.identityId,
          displayName: loadedSession.principal.displayName,
          email: loadedSession.principal.email,
          roles: ['manager'] as const,
        },
      },
    })),
  }) as unknown as IdentityModule['application'];

const makeTestApp = (input: {
  application: ControlAuthApplication;
  resolveAccess?: ResolveControlAccess;
  secureCookies?: boolean;
}) => {
  const sessionOptions = {
    ...options,
    secureCookies: input.secureCookies ?? false,
  };
  const names = controlCookieNames(sessionOptions.secureCookies);
  const resolveAccess = input.resolveAccess ?? vi.fn(async () => controlAccess);
  const authentication = makeControlSessionAuthentication({
    application: input.application,
    resolveAccess,
    names,
    options: sessionOptions,
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/control/auth',
    makeControlSessionRoutes({
      application: input.application,
      loadCookieSession: authentication.loadCookieSession,
      resolveAccess,
      names,
      options: sessionOptions,
    }),
  );
  app.post(
    '/unsafe',
    authentication.authenticate,
    authentication.requireCapability('team:write'),
    (_request, response) => response.status(200).json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
};

describe('Control browser session boundary', () => {
  it('keeps the session credential HttpOnly and returns scoped capabilities', async () => {
    const app = makeTestApp({ application: makeApplication() });
    const baseUrl = await start(app);
    const response = await fetch(`${baseUrl}/control/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: 'manager@example.com',
        password: 'correct-horse-battery',
      }),
    });
    const body = await response.text();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(body).not.toMatch(/accessToken|opaque-session-token/);
    expect(body).toContain('"team:write"');
    expect(setCookie).toContain('pressly_control_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('Domain=');
  });

  it('requires exact origin and CSRF for every unsafe cookie request', async () => {
    const app = makeTestApp({ application: makeApplication() });
    const baseUrl = await start(app);
    const cookie = `pressly_control_session=${sessionToken}`;
    const csrf = deriveControlCsrfToken(sessionToken, csrfSecret);

    const noProof = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(noProof.status).toBe(403);

    const wrongOrigin = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: 'http://attacker.test',
        'X-CSRF-Token': csrf,
      },
    });
    expect(wrongOrigin.status).toBe(403);

    const accepted = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf },
    });
    expect(accepted.status).toBe(200);
  });

  it('has no bearer-token fallback and rejects identities without Control access', async () => {
    const application = makeApplication();
    const app = makeTestApp({
      application,
      resolveAccess: vi.fn(async () => null),
    });
    const baseUrl = await start(app);

    const bearer = await fetch(`${baseUrl}/unsafe`, {
      method: 'POST',
      headers: { Authorization: 'Bearer service-token' },
    });
    expect(bearer.status).toBe(401);

    const deniedLogin = await fetch(`${baseUrl}/control/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: 'manager@example.com',
        password: 'correct-horse-battery',
      }),
    });
    expect(deniedLogin.status).toBe(403);
    expect(application.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: sessionToken }),
    );
  });

  it('stores MFA challenges only in a separate HttpOnly cookie', async () => {
    const application = makeApplication({
      loginValue: {
        status: 'mfa_required',
        challengeToken,
        expiresAt: expiresAtDate,
      },
    });
    const app = makeTestApp({ application });
    const baseUrl = await start(app);
    const login = await fetch(`${baseUrl}/control/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: 'manager@example.com',
        password: 'correct-horse-battery',
      }),
    });

    expect(await login.text()).not.toContain(challengeToken);
    expect(login.headers.get('set-cookie')).toContain('pressly_control_mfa=');
  });

  it('uses __Host Secure cookies in production mode', async () => {
    const app = makeTestApp({
      application: makeApplication(),
      secureCookies: true,
    });
    const baseUrl = await start(app);
    const response = await fetch(`${baseUrl}/control/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: 'manager@example.com',
        password: 'correct-horse-battery',
      }),
    });
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('__Host-pressly-control-session=');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain=');
  });
});

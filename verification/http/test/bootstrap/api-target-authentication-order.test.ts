import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import { makeHttpCatalogFromOwners } from '@pressly/topology/http';
import { mountHttpBoundaryCatalog } from '@pressly/http-host';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  makeApiHttpBoundaryHostDependencies,
  makeApiHttpBoundaryProviderRegistry,
} from '@pressly/http-host/runtime';
import {
  makeApiTargetAuthenticationProviders,
  makeApiTargetBrowserPresentation,
  type ApiTargetAuthenticationProviderDependencies,
} from '../../../../topology/runtime/http/bootstrap/target-authentication-providers.ts';
import {
  makeApiBoundaryProviderFixture,
  makeApiTargetOwnerFixture,
} from './api-target.fixtures.ts';

const realm = {
  control: {
    origin: 'https://control.pressly.test',
    csrfSecret: 'control-csrf-secret-at-least-32-bytes',
    secureCookies: false,
  },
  processor: {
    origin: 'https://processor.pressly.test',
    csrfSecret: 'processor-csrf-secret-at-least-32-bytes',
    secureCookies: false,
  },
} as const;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) =>
              error === undefined ? resolve() : reject(error),
            ),
          ),
      ),
  );
});

const listen = async (app: Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}`;
};

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const normalized = normalizeUnknownError(error);
  response.status(normalized.status).json({
    code: normalized.code,
    message: normalized.safeMessage,
  });
};

const targetApp = (): Express => {
  const owners = makeApiTargetOwnerFixture();
  const catalog = makeHttpCatalogFromOwners({
    'experience:control': owners.experiences.control,
    'experience:customer': owners.experiences.customer,
    'experience:processor': owners.experiences.processor,
    'system:ingress': owners.systems.ingress,
    'system:orders': owners.systems.orders,
    'system:pricing': owners.systems.pricing,
    'system:production': owners.systems.production,
  });
  const authentication = makeApiTargetAuthenticationProviders({
    access: owners.systems.access,
    control: owners.experiences.control,
    processor: owners.experiences.processor,
    controlRealm: realm.control,
    processorRealm: realm.processor,
  });
  const base = makeApiBoundaryProviderFixture();
  const registry = makeApiHttpBoundaryProviderRegistry({
    ...base,
    middleware: { ...base.middleware, ...authentication.middleware },
    context: { ...base.context, ...authentication.context },
  });
  const app = express();
  mountHttpBoundaryCatalog({
    router: app,
    catalog,
    dependencies: makeApiHttpBoundaryHostDependencies(registry),
  });
  app.use(errorHandler);
  return app;
};

const request = async (input: {
  origin: string;
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}) => {
  const response = await fetch(input.path, {
    method: input.method,
    headers: {
      origin: input.origin,
      ...(input.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Readonly<{
      code: string;
      message: string;
    }>,
  };
};

describe('target cookie-boundary order', () => {
  it('keeps the named origin-first correction for missing-cookie Control mutations', async () => {
    const targetOrigin = await listen(targetApp());
    const target = await request({
      origin: 'https://bad-origin.test',
      path: `${targetOrigin}/control/customers`,
      method: 'POST',
      body: {},
    });

    expect({ legacyCode: 'control_session_missing', target }).toEqual({
      legacyCode: 'control_session_missing',
      target: {
        status: 403,
        body: {
          code: 'control_origin_rejected',
          message: 'This Control request was rejected.',
        },
      },
    });
  });

  it('keeps missing-cookie precedence for valid origin with absent CSRF', async () => {
    const origin = await listen(targetApp());
    await expect(
      request({
        origin: realm.control.origin,
        path: `${origin}/control/customers`,
        method: 'POST',
        body: {},
      }),
    ).resolves.toMatchObject({
      status: 401,
      body: { code: 'control_session_missing' },
    });
  });

  it('limits the correction to mutating Control and Processor logout routes', async () => {
    const origin = await listen(targetApp());
    for (const fixture of [
      { realm: 'control', validOrigin: realm.control.origin },
      { realm: 'processor', validOrigin: realm.processor.origin },
    ] as const) {
      await expect(
        request({
          origin: 'https://bad-origin.test',
          path: `${origin}/${fixture.realm}/auth/logout`,
          method: 'POST',
          body: {},
        }),
      ).resolves.toMatchObject({
        status: 403,
        body: { code: `${fixture.realm}_origin_rejected` },
      });
      await expect(
        request({
          origin: 'https://bad-origin.test',
          path: `${origin}/${fixture.realm}/auth/session`,
          method: 'GET',
        }),
      ).resolves.toMatchObject({
        status: 401,
        body: { code: `${fixture.realm}_session_missing` },
      });
    }
  });

  it('lets each auth and invitation surface own missing-cookie vocabulary', async () => {
    const origin = await listen(targetApp());
    const fixtures = [
      {
        path: '/control/auth/mfa/challenge',
        origin: realm.control.origin,
        body: { method: 'totp', code: '000000' },
        code: 'control_mfa_challenge_missing',
      },
      {
        path: '/control/invitations/accept/existing/mfa',
        origin: realm.control.origin,
        body: {
          acceptanceToken: 'a'.repeat(32),
          idempotencyKey: 'invitation-accept-1',
          method: 'totp',
          code: '000000',
        },
        code: 'invitation_mfa_challenge_missing',
      },
      {
        path: '/processor/auth/mfa/challenge',
        origin: realm.processor.origin,
        body: { method: 'totp', code: '000000' },
        code: 'processor_mfa_challenge_missing',
      },
      {
        path: '/processor/auth/logout',
        origin: realm.processor.origin,
        body: {},
        code: 'processor_session_missing',
      },
    ];

    for (const fixture of fixtures)
      await expect(
        request({
          path: `${origin}${fixture.path}`,
          method: 'POST',
          origin: fixture.origin,
          body: fixture.body,
        }),
      ).resolves.toMatchObject({ status: 401, body: { code: fixture.code } });
  });

  it('keeps Control authentication free of integrated origin and CSRF checks', async () => {
    const loaded = {
      principal: {
        identityId: 'identity-1',
        kind: 'human' as const,
        displayName: 'Control Operator',
      },
      principalAttributes: {
        assignments: [],
        identityActive: true,
        assuranceLevel: 'mfa' as const,
      },
    };
    const providers = makeApiTargetAuthenticationProviders({
      access: {
        cells: {
          loadSession: {
            execute: async () => ({ kind: 'success' as const, value: loaded }),
          },
        },
      },
      control: {
        cells: {
          resolveAccess: {
            execute: async () => ({
              kind: 'success' as const,
              value: { capabilities: [] },
            }),
          },
        },
      },
      processor: { cells: {} },
      controlRealm: realm.control,
      processorRealm: realm.processor,
    } as unknown as ApiTargetAuthenticationProviderDependencies);
    const app = express();
    app.post(
      '/authenticate-only',
      providers.middleware['control-cookie-session']({} as never),
      (_request, response) => response.sendStatus(204),
    );
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/authenticate-only`, {
      method: 'POST',
      headers: {
        cookie: 'pressly_control_session=session-token',
        origin: 'https://bad-origin.test',
      },
    });
    expect(response.status).toBe(204);
  });

  it('fences the Control bearer realm with current Control access and revokes a denied bearer', async () => {
    const calls: string[] = [];
    const loaded = {
      principal: {
        identityId: 'identity-without-control-access',
        kind: 'human' as const,
        displayName: 'Denied Identity',
        sessionId: 'denied-session',
      },
      principalAttributes: {
        assignments: [],
        identityActive: true,
        assuranceLevel: 'mfa' as const,
      },
    };
    const providers = makeApiTargetAuthenticationProviders({
      access: {
        cells: {
          loadSession: {
            execute: async ({ bearerToken }: { bearerToken: string }) => {
              calls.push(`load:${bearerToken}`);
              return { kind: 'success' as const, value: loaded };
            },
          },
          revokeSession: {
            execute: async ({ bearerToken }: { bearerToken: string }) => {
              calls.push(`revoke:${bearerToken}`);
              return {
                kind: 'success' as const,
                value: { revoked: true as const },
              };
            },
          },
        },
      },
      control: {
        cells: {
          resolveAccess: {
            execute: async () => {
              calls.push('resolve-control');
              return { kind: 'success' as const, value: null };
            },
          },
        },
      },
      processor: { cells: {} },
      controlRealm: realm.control,
      processorRealm: realm.processor,
    } as unknown as ApiTargetAuthenticationProviderDependencies);
    const app = express();
    app.get(
      '/control-bearer',
      providers.middleware['control-bearer-session']({} as never),
      (_request, response) => response.sendStatus(204),
    );
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control-bearer`, {
      headers: {
        authorization: 'Bearer denied-bearer-token',
        cookie: 'pressly_control_session=ambient-cookie-token',
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'control_access_unavailable',
    });
    expect(calls).toEqual([
      'load:denied-bearer-token',
      'resolve-control',
      'revoke:denied-bearer-token',
    ]);
  });

  it('rejects and revokes a Customer-audience bearer before Control access resolution', async () => {
    const calls: string[] = [];
    const providers = makeApiTargetAuthenticationProviders({
      access: {
        cells: {
          loadSession: {
            execute: async () => ({
              kind: 'success' as const,
              value: {
                principal: {
                  identityId: 'customer-identity',
                  kind: 'human' as const,
                  displayName: 'Customer',
                  audience: 'customer' as const,
                  customerId: 'customer-1',
                  sessionId: 'customer-session',
                },
                principalAttributes: {
                  assignments: [],
                  identityActive: true,
                  assuranceLevel: 'mfa' as const,
                },
              },
            }),
          },
          revokeSession: {
            execute: async ({ bearerToken }: { bearerToken: string }) => {
              calls.push(`revoke:${bearerToken}`);
              return {
                kind: 'success' as const,
                value: { revoked: true as const },
              };
            },
          },
        },
      },
      control: {
        cells: {
          resolveAccess: {
            execute: async () => {
              calls.push('unexpected-resolve');
              return { kind: 'success' as const, value: null };
            },
          },
        },
      },
      processor: { cells: {} },
      controlRealm: realm.control,
      processorRealm: realm.processor,
    } as unknown as ApiTargetAuthenticationProviderDependencies);
    const app = express();
    app.get(
      '/control-customer-bearer',
      providers.middleware['control-bearer-session']({} as never),
      (_request, response) => response.sendStatus(204),
    );
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/control-customer-bearer`, {
      headers: { authorization: 'Bearer customer-bearer-token' },
    });

    expect(response.status).toBe(403);
    expect(calls).toEqual(['revoke:customer-bearer-token']);
  });

  it('keeps Processor cookie-or-bearer authentication conditional', async () => {
    const calls: string[] = [];
    const providers = makeApiTargetAuthenticationProviders({
      access: {
        cells: {
          loadSession: {
            execute: async ({ bearerToken }: { bearerToken: string }) => {
              calls.push(bearerToken);
              return {
                kind: 'failure' as const,
                failure: {
                  code: 'invalid_session',
                  message: 'Invalid session.',
                },
              };
            },
          },
        },
      },
      control: { cells: {} },
      processor: { cells: {} },
      controlRealm: realm.control,
      processorRealm: realm.processor,
    } as unknown as ApiTargetAuthenticationProviderDependencies);
    const app = express();
    app.get(
      '/authenticate',
      providers.middleware['processor-cookie-or-bearer-session']({} as never),
    );
    app.use(errorHandler);
    const origin = await listen(app);
    const response = await fetch(`${origin}/authenticate`, {
      headers: {
        authorization: 'Bearer bearer-token',
        cookie: 'pressly_processor_session=cookie-token',
      },
    });
    expect(response.status).toBe(401);
    expect(calls).toEqual(['bearer-token']);
  });

  it('serializes two cookies and derives CSRF with exact legacy wire shape', () => {
    const presentation = makeApiTargetBrowserPresentation({
      realm: 'control',
      options: realm.control,
    });
    expect(
      presentation.serializeCookies([
        {
          action: 'set',
          cookie: 'session',
          value: 'session token',
          expiresAt: new Date('2026-08-22T17:00:00.000Z'),
        },
        { action: 'clear', cookie: 'mfa' },
      ]),
    ).toEqual([
      'pressly_control_session=session%20token; Path=/; Expires=Sat, 22 Aug 2026 17:00:00 GMT; HttpOnly; SameSite=Strict',
      'pressly_control_mfa=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
    ]);
    expect(presentation.deriveCsrfToken('session token')).toBe(
      createHmac('sha256', realm.control.csrfSecret)
        .update('pressly.control.csrf.v1\0', 'utf8')
        .update('session token', 'utf8')
        .digest('base64url'),
    );
  });
});

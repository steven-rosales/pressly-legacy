import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IdentityModule, WorkforceApplication } from '@pressly/identity';
import { isAppError, makeAppError } from '@pressly/errors/app-error';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlCookieNames } from '../../src/http/control/session/control-cookie.adapter.ts';
import type {
  ControlAccess,
  ControlAuthApplication,
  ControlSessionOptions,
} from '../../src/http/control/session/control-session.port.ts';
import { makeControlInvitationAcceptanceRoutes } from '../../src/http/control/workforce/control-invitation.route.ts';
import { makeTestControlExperience } from './control-experience.fixture.ts';

const origin = 'http://control.test';
const businessId = '00000000-0000-4000-8000-000000000100';
const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const membershipId = '00000000-0000-4000-8000-000000000003';
const invitationId = '00000000-0000-4000-8000-000000000004';
const sessionToken = 'opaque-session-token-at-least-32-characters';
const challengeToken = 'opaque-challenge-token-at-least-32-characters';
const acceptanceToken = 'one-time-invitation-token-that-is-long-enough';
const expiresAt = '2026-08-01T20:00:00.000Z';
const expiresAtDate = new Date(expiresAt);
const options: ControlSessionOptions = {
  origin,
  csrfSecret: 'test-control-csrf-secret-at-least-32-bytes',
  secureCookies: false,
  processorOrigin: 'http://processor.test',
};
const names = controlCookieNames(false);
const loadedSession = {
  principal: {
    identityId,
    kind: 'human' as const,
    displayName: 'Manager One',
    email: 'manager@example.com',
    sessionId,
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
  business: { id: businessId, name: 'Pressly One' },
  locations: [],
  selectedLocationId: null,
  capabilities: ['control:view', 'team:read', 'team:write'],
  applications: [
    {
      id: 'control',
      label: 'Pressly Control',
      description: 'Manage the business.',
      href: origin,
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
  response.status(500).json({ ok: false });
};

const pass: RequestHandler = (_request, _response, next) => next();
const requireOrigin: RequestHandler = (request, _response, next) => {
  if (request.header('origin') === origin) {
    next();
    return;
  }
  next(
    makeAppError({
      kind: 'PermissionError',
      code: 'control_origin_rejected',
      message: 'Origin rejected.',
      safeMessage: 'Request origin was rejected.',
      status: 403,
    }),
  );
};

const makeWorkforce = (
  acceptError = false,
  intendedRole: 'manager' | 'operator' = 'manager',
) =>
  ({
    previewInvitation: vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        invitationId,
        businessId,
        businessName: 'Pressly One',
        emailNormalized: 'manager@example.com',
        displayName: 'Manager One',
        intendedRole,
        intendedLocationId: intendedRole === 'operator' ? 'laundry-1' : null,
        expiresAt: new Date('2026-08-04T16:00:00.000Z'),
        existingIdentity: true,
      },
    })),
    acceptInvitation: vi.fn(async () =>
      acceptError
        ? {
            tag: 'err' as const,
            error: {
              kind: 'conflict' as const,
              code: 'expired_token',
              message: 'This invitation is no longer available.',
            },
          }
        : {
            tag: 'ok' as const,
            value: {
              invitation: { id: invitationId, intendedRole },
              membershipId,
              identityId,
              identityCreated: false,
              privilegedAccessEffective: true,
              replayed: false,
            },
          },
    ),
  }) as unknown as WorkforceApplication;

const makeAuth = (mfaRequired = false): ControlAuthApplication =>
  ({
    login: vi.fn(async () => ({
      tag: 'ok' as const,
      value: mfaRequired
        ? {
            status: 'mfa_required' as const,
            challengeToken,
            expiresAt: expiresAtDate,
          }
        : {
            accessToken: sessionToken,
            expiresAt: expiresAtDate,
            principal: {
              identityId,
              displayName: 'Manager One',
              email: 'manager@example.com',
              roles: [] as const,
            },
          },
    })),
    completeMfaChallenge: vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        accessToken: sessionToken,
        expiresAt: expiresAtDate,
        principal: {
          identityId,
          displayName: 'Manager One',
          email: 'manager@example.com',
          roles: [] as const,
        },
      },
    })),
    loadSession: vi.fn(async () => ({
      tag: 'ok' as const,
      value: loadedSession,
    })),
    revokeSession: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { revoked: true as const },
    })),
  }) as unknown as IdentityModule['application'];

const makeApp = (input: {
  workforce: WorkforceApplication;
  auth: ControlAuthApplication;
  resolveAccess?: () => Promise<ControlAccess | null>;
}) => {
  const app = express();
  const experience = makeTestControlExperience({
    workforce: input.workforce,
  });
  app.use(express.json());
  app.use(
    '/control/invitations',
    makeControlInvitationAcceptanceRoutes({
      application: experience.invitations,
      authApplication: input.auth,
      authenticateExisting: pass,
      limitExistingIdentity: pass,
      requireOrigin,
      names,
      sessionOptions: options,
      resolveAccess: vi.fn(input.resolveAccess ?? (async () => controlAccess)),
    }),
  );
  app.use(errorHandler);
  return app;
};

describe('Control existing-identity invitation bootstrap', () => {
  it('proves credentials, accepts the invitation, and exposes no token to JavaScript', async () => {
    const workforce = makeWorkforce();
    const auth = makeAuth();
    const baseUrl = await start(makeApp({ workforce, auth }));
    const response = await fetch(
      `${baseUrl}/control/invitations/accept/existing/password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          acceptanceToken,
          idempotencyKey: 'accept-existing-001',
          password: 'correct-horse-battery',
        }),
      },
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"status":"accepted"');
    expect(text).toContain('"destination"');
    expect(text).not.toContain(sessionToken);
    expect(response.headers.get('set-cookie')).toContain(
      'pressly_control_session=',
    );
    expect(workforce.acceptInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        rawToken: acceptanceToken,
        acceptance: {
          kind: 'existing_identity',
          authenticatedIdentityId: identityId,
          authenticatedSessionId: sessionId,
        },
      }),
    );
  });

  it('keeps the MFA challenge in an HttpOnly cookie across acceptance', async () => {
    const workforce = makeWorkforce();
    const auth = makeAuth(true);
    const baseUrl = await start(makeApp({ workforce, auth }));
    const password = await fetch(
      `${baseUrl}/control/invitations/accept/existing/password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          acceptanceToken,
          idempotencyKey: 'accept-existing-002',
          password: 'correct-horse-battery',
        }),
      },
    );
    const challengeCookie = password.headers.get('set-cookie') ?? '';

    expect(await password.text()).not.toContain(challengeToken);
    expect(challengeCookie).toContain('pressly_control_mfa=');
    const mfaCookie = challengeCookie.match(
      /(?:^|,\s*)(pressly_control_mfa=[^;,]+)/,
    )?.[1];
    expect(mfaCookie).toBeDefined();

    const completed = await fetch(
      `${baseUrl}/control/invitations/accept/existing/mfa`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie: mfaCookie!,
        },
        body: JSON.stringify({
          acceptanceToken,
          idempotencyKey: 'accept-existing-002',
          method: 'totp',
          code: '123456',
        }),
      },
    );
    expect(completed.status).toBe(200);
    expect(await completed.text()).toContain('"status":"accepted"');
  });

  it('revokes the bootstrap session when invitation acceptance fails', async () => {
    const workforce = makeWorkforce(true);
    const auth = makeAuth();
    const baseUrl = await start(makeApp({ workforce, auth }));
    const response = await fetch(
      `${baseUrl}/control/invitations/accept/existing/password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          acceptanceToken,
          idempotencyKey: 'accept-existing-003',
          password: 'correct-horse-battery',
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(auth.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: sessionToken }),
    );
  });

  it('accepts an operator invitation without pretending the operator has Control access', async () => {
    const workforce = makeWorkforce(false, 'operator');
    const auth = makeAuth();
    const baseUrl = await start(
      makeApp({
        workforce,
        auth,
        resolveAccess: async () => null,
      }),
    );
    const response = await fetch(
      `${baseUrl}/control/invitations/accept/existing/password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          acceptanceToken,
          idempotencyKey: 'accept-existing-004',
          password: 'correct-horse-battery',
        }),
      },
    );
    const body = (await response.json()) as {
      data: {
        status: string;
        session: unknown;
        destination: { id: string };
      };
    };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      status: 'accepted',
      session: null,
      destination: { id: 'processor' },
    });
    expect(auth.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ bearerToken: sessionToken }),
    );
  });
});

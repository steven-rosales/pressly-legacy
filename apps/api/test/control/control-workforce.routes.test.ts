import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WorkforceApplication } from '@pressly/auth-module';
import { isAppError, makeAppError } from '@pressly/errors';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeControlWorkforceRoutes } from '../../src/http/control/workforce/control-workforce.route.ts';

const businessId = '00000000-0000-4000-8000-000000000100';
const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const membershipId = '00000000-0000-4000-8000-000000000003';
const invitationId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-08-01T16:00:00.000Z');
const invitation = {
  id: invitationId,
  businessId,
  emailNormalized: 'operator@example.com',
  displayName: 'Operator One',
  intendedRole: 'operator' as const,
  intendedLocationId: 'laundry-1',
  state: 'pending' as const,
  version: 1,
  expiresAt: new Date('2026-08-04T16:00:00.000Z'),
  createdAt: now,
};
const member = {
  membershipId,
  businessId,
  identityId,
  displayName: 'Operator One',
  email: 'operator@example.com',
  state: 'active' as const,
  version: 1,
  mfaEnabled: false,
  grants: [],
  startedAt: now,
  suspendedAt: null,
  endedAt: null,
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

const authentication: RequestHandler = (_request, response, next) => {
  response.locals['auth'] = {
    principal: { identityId, sessionId },
  };
  response.locals['controlAccess'] = {
    business: { id: businessId, name: 'Pressly One' },
  };
  next();
};
const pass: RequestHandler = (_request, _response, next) => next();

const makeApplication = () =>
  ({
    listWorkforce: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { members: [member], nextCursor: null },
    })),
    getWorkforceMember: vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        ...member,
        activeSessionCount: 1,
        createdAt: now,
        updatedAt: now,
      },
    })),
    listInvitations: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { invitations: [invitation], nextCursor: null },
    })),
    issueInvitation: vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        status: 'issued' as const,
        invitation,
        token: 'one-time-invitation-token-that-is-long-enough',
      },
    })),
    reissueInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    suspendMembership: vi.fn(),
    reactivateMembership: vi.fn(),
    endMembership: vi.fn(),
    grantAccess: vi.fn(),
    revokeAccess: vi.fn(),
    listMemberSessions: vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        sessions: [
          {
            id: sessionId,
            issuedAt: '2026-08-01T14:00:00.000Z',
            lastUsedAt: '2026-08-01T15:00:00.000Z',
            expiresAt: '2026-08-01T20:00:00.000Z',
            revokedAt: null,
            current: true,
          },
        ],
      },
    })),
    revokeMemberSessions: vi.fn(async () => ({
      tag: 'ok' as const,
      value: { revokedCount: 1, replayed: false },
    })),
    listSecurityEvents: vi.fn(),
  }) as unknown as WorkforceApplication;

const makeApp = (application: WorkforceApplication) => {
  const app = express();
  app.use(express.json());
  app.use(
    '/control',
    makeControlWorkforceRoutes({
      application,
      authenticate: authentication,
      limitIdentity: pass,
      requireRead: pass,
      requireWrite: pass,
    }),
  );
  app.use(errorHandler);
  return app;
};

describe('Control workforce routes', () => {
  it('uses server-selected business and authenticated actor for lists', async () => {
    const application = makeApplication();
    const baseUrl = await start(makeApp(application));
    const response = await fetch(
      `${baseUrl}/control/team?state=active&limit=25`,
    );
    const body = (await response.json()) as {
      data: { members: unknown[] };
    };

    expect(response.status).toBe(200);
    expect(body.data.members).toHaveLength(1);
    expect(application.listWorkforce).toHaveBeenCalledWith({
      actor: { identityId, sessionId },
      businessId,
      states: ['active'],
      limit: 25,
    });
  });

  it('returns a raw invitation token only for the first issued response', async () => {
    const application = makeApplication();
    const baseUrl = await start(makeApp(application));
    const response = await fetch(`${baseUrl}/control/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'issue-invite-001',
        email: 'operator@example.com',
        displayName: 'Operator One',
        intendedRole: 'operator',
        intendedLocationId: 'laundry-1',
      }),
    });
    const body = (await response.json()) as {
      data: { status: string; acceptanceToken?: string };
    };

    expect(response.status).toBe(201);
    expect(body.data.status).toBe('issued');
    expect(body.data.acceptanceToken).toBe(
      'one-time-invitation-token-that-is-long-enough',
    );

    vi.mocked(application.issueInvitation).mockResolvedValueOnce({
      tag: 'ok',
      value: { status: 'replayed', invitation },
    });
    const replay = await fetch(`${baseUrl}/control/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'issue-invite-001',
        email: 'operator@example.com',
        displayName: 'Operator One',
        intendedRole: 'operator',
        intendedLocationId: 'laundry-1',
      }),
    });
    const replayBody = (await replay.json()) as {
      data: { status: string; acceptanceToken?: string };
    };
    expect(replayBody.data.status).toBe('replayed');
    expect(replayBody.data).not.toHaveProperty('acceptanceToken');
  });

  it('serializes safe domain errors without leaking internal details', async () => {
    const application = makeApplication();
    vi.mocked(application.listWorkforce).mockResolvedValueOnce({
      tag: 'err',
      error: makeAppError({
        kind: 'PermissionError',
        code: 'workforce_scope_denied',
        message: 'Internal scope comparison detail.',
        safeMessage: 'You do not have access to this team.',
        status: 403,
      }),
    });
    const baseUrl = await start(makeApp(application));
    const response = await fetch(`${baseUrl}/control/team`);
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).toContain('You do not have access to this team.');
    expect(text).not.toContain('Internal scope comparison detail.');
  });

  it('scopes member-session inventory to the authenticated business and actor', async () => {
    const application = makeApplication();
    const baseUrl = await start(makeApp(application));
    const response = await fetch(
      `${baseUrl}/control/team/${membershipId}/sessions`,
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"current":true');
    expect(text).not.toMatch(/token|secret/i);
    expect(application.listMemberSessions).toHaveBeenCalledWith({
      actor: { identityId, sessionId },
      businessId,
      membershipId,
    });
  });

  it.each([
    {
      label: 'membership',
      path: '/control/team/not-a-uuid/suspend',
      applicationMethod: 'suspendMembership' as const,
    },
    {
      label: 'invitation',
      path: '/control/invitations/not-a-uuid/reissue',
      applicationMethod: 'reissueInvitation' as const,
    },
    {
      label: 'grant',
      path: '/control/grants/not-a-uuid/revoke',
      applicationMethod: 'revokeAccess' as const,
    },
  ])(
    'rejects a malformed $label UUID before calling the application',
    async ({ path, applicationMethod }) => {
      const application = makeApplication();
      const baseUrl = await start(makeApp(application));
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'invalid-path-001',
          expectedVersion: 1,
        }),
      });

      expect(response.status).toBe(422);
      expect(application[applicationMethod]).not.toHaveBeenCalled();
    },
  );
});

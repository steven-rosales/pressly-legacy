import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WorkforceApplication } from '@pressly/auth-module';
import { isAppError } from '@pressly/errors';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeControlSecurityRoutes } from '../../src/http/control/security/control-security.route.ts';

const businessId = '00000000-0000-4000-8000-000000000100';
const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
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

describe('Control security routes', () => {
  it('returns only the business-scoped redacted event projection', async () => {
    const listSecurityEvents = vi.fn(async () => ({
      tag: 'ok' as const,
      value: {
        events: [
          {
            id: '00000000-0000-4000-8000-000000000201',
            eventType: 'auth.workforce_session_revoked',
            resourceType: 'workforce_membership',
            actorDisplayName: 'Owner One',
            createdAt: '2026-08-01T15:00:00.000Z',
          },
        ],
        nextCursor: null,
      },
    }));
    const application = {
      listSecurityEvents,
    } as unknown as WorkforceApplication;
    const app = express();
    app.use(
      '/control',
      makeControlSecurityRoutes({
        application,
        authenticate: authentication,
        limitIdentity: pass,
        requireRead: pass,
      }),
    );
    app.use(errorHandler);
    const baseUrl = await start(app);
    const response = await fetch(`${baseUrl}/control/security/events?limit=25`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('auth.workforce_session_revoked');
    expect(text).not.toMatch(/metadata|resourceId|ipAddress/i);
    expect(listSecurityEvents).toHaveBeenCalledWith({
      actor: { identityId, sessionId },
      businessId,
      limit: 25,
    });
  });
});

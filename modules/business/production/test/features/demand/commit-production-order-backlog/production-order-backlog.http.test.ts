import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeProductionRoutes,
  type ProductionHttpApplication,
  type ProductionRouteSecurity,
} from '../../../../src/composition/production.composition.ts';
import { makeCommitProductionOrderBacklogRoute } from '../../../../src/features/demand/commit-production-order-backlog/commit-production-order-backlog.route.ts';
import { makePreviewProductionOrderBacklogRoute } from '../../../../src/features/demand/preview-production-order-backlog/preview-production-order-backlog.route.ts';

const locationId = 'location-1';
const actorId = '00000000-0000-4000-8000-000000000201';
const bulkOperationId = '00000000-0000-4000-8000-000000000301';
const cutoff = '2026-07-01T00:00:00.000Z';
const previewHash = 'a'.repeat(64);
const servers: Server[] = [];

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

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

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const status = Number(error?.status ?? 500);
  response.status(status).json({
    ok: false,
    error: {
      code: String(error?.code ?? 'unexpected_error'),
      message: String(error?.safeMessage ?? 'Unexpected error.'),
    },
  });
};

const emptyPreview = {
  locationId,
  filter: 'all_due_before_cutoff' as const,
  cutoff,
  reason: 'processor_not_in_use' as const,
  maxOrders: 250,
  candidateCount: 0,
  hasMore: false,
  cursor: null,
  nextCursor: null,
  previewHash,
  generatedAt: '2026-07-27T04:00:00.000Z',
  groups: {
    readyToArchive: [],
    reviewIndividually: [],
    keptForSafety: [],
    alreadyHistorical: [],
  },
};

const makeApp = () => {
  const preview = vi.fn(async () => result.ok(emptyPreview));
  const commit = vi.fn(async (command) =>
    result.ok({
      locationId: command.locationId,
      bulkOperationId,
      previewHash: command.previewHash,
      nextCursor: null,
      resolvedCount: 0,
      resolved: [],
      committedAt: '2026-07-27T04:00:00.000Z',
      replayed: false,
    }),
  );
  const authenticate = vi.fn((_request, _response, next) => next());
  const authorize = vi.fn((_request, _response, next) => next());
  const app = express();
  app.use(express.json());
  app.use(
    makePreviewProductionOrderBacklogRoute({
      preview,
      authenticate,
      authorize,
    }),
  );
  app.use(
    makeCommitProductionOrderBacklogRoute({
      commit,
      authenticate,
      authorize,
      readActorId: () => actorId,
    }),
  );
  app.use(errorHandler);
  return { app, preview, commit, authenticate, authorize };
};

const requestScope = {
  filter: 'all_due_before_cutoff',
  cutoff,
  reason: 'processor_not_in_use',
} as const;

describe('production order backlog HTTP boundary', () => {
  it('maps a strict manager preview request to the bounded server use case', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/order-backlog/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestScope),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: emptyPreview,
    });
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).toHaveBeenCalledOnce();
    expect(harness.preview).toHaveBeenCalledWith({
      locationId,
      ...requestScope,
      cursor: null,
      maxOrders: 250,
    });
  });

  it('maps the authenticated manager into the exact preview-bound commit', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/order-backlog`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestScope,
          previewHash,
          idempotencyKey: 'backlog-http-commit-1',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        locationId,
        bulkOperationId,
        previewHash,
        resolvedCount: 0,
        replayed: false,
      },
    });
    expect(harness.commit).toHaveBeenCalledWith({
      locationId,
      ...requestScope,
      cursor: null,
      maxOrders: 250,
      note: null,
      previewHash,
      idempotencyKey: 'backlog-http-commit-1',
      actorId,
    });
  });

  it('rejects browser-owned candidates and over-bound requests before authorization', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/order-backlog/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestScope,
          maxOrders: 251,
          candidateIds: ['00000000-0000-4000-8000-000000000001'],
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.preview).not.toHaveBeenCalled();
  });

  it('rejects an unexplained other bulk reason before authorization', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/order-backlog`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestScope,
          reason: 'other',
          previewHash,
          idempotencyKey: 'backlog-http-other-1',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.commit).not.toHaveBeenCalled();
  });

  it('wires both backlog routes through the owner/admin override guard', async () => {
    const preview = vi.fn(async () => result.ok(emptyPreview));
    const read = vi.fn((_request, _response, next) => next());
    const override = vi.fn((_request, response) =>
      response.status(403).json({
        ok: false,
        error: { code: 'forbidden', message: 'Manager access required.' },
      }),
    );
    const permit: RequestHandler = (_request, _response, next) => next();
    const application = {
      previewProductionOrderBacklog: preview,
      commitProductionOrderBacklog: vi.fn(),
    } as unknown as ProductionHttpApplication;
    const security = {
      authenticate: permit,
      read,
      schedule: permit,
      accept: permit,
      start: permit,
      queue: permit,
      override,
      priority: permit,
      intake: permit,
      admission: permit,
      resources: permit,
      stage: permit,
      readActorId: () => actorId,
      readAllowedLocationIds: async () => null,
    } satisfies ProductionRouteSecurity;
    const app = express();
    app.use(express.json());
    app.use(makeProductionRoutes({ application, security }));
    app.use(errorHandler);

    const response = await fetch(
      `${await start(app)}/production/locations/${locationId}/order-backlog/preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestScope),
      },
    );

    expect(response.status).toBe(403);
    expect(override).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
});

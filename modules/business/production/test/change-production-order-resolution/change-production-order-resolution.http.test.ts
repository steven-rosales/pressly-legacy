import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, { type ErrorRequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChangeProductionOrderResolutionRoute } from '../../src/change-production-order-resolution/change-production-order-resolution.route.ts';

const locationId = 'location-1';
const orderId = '00000000-0000-4000-8000-000000000101';
const actorId = '00000000-0000-4000-8000-000000000201';
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

const makeApp = () => {
  const changeResolution = vi.fn(async (command) =>
    result.ok({
      locationId: command.locationId,
      orderId: command.orderId,
      action: command.action,
      resolutionState:
        command.action === 'resolve_without_production'
          ? ('resolved_without_production' as const)
          : ('open' as const),
      transitionedAt: '2026-07-26T23:00:00.000Z',
      version: command.expectedVersion + 1,
      replayed: false,
    }),
  );
  const authenticate = vi.fn((_request, _response, next) => next());
  const authorize = vi.fn((_request, _response, next) => next());
  const app = express();
  app.use(express.json());
  app.use(
    makeChangeProductionOrderResolutionRoute({
      changeResolution,
      authenticate,
      authorize,
      readActorId: () => actorId,
    }),
  );
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = Number(error?.status ?? 500);
    response.status(status).json({
      ok: false,
      error: {
        code: String(error?.code ?? 'unexpected_error'),
        message: String(error?.safeMessage ?? 'Unexpected error.'),
      },
    });
  };
  app.use(errors);
  return { app, changeResolution, authenticate, authorize };
};

describe('change production order resolution HTTP boundary', () => {
  it('maps strict input and the authenticated manager into a resolve command', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/orders/${orderId}/resolution`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_without_production',
          reason: 'processor_not_in_use',
          expectedVersion: 1,
          idempotencyKey: 'resolution-command-1',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        locationId,
        orderId,
        action: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        version: 2,
      },
    });
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).toHaveBeenCalledOnce();
    expect(harness.changeResolution).toHaveBeenCalledWith({
      locationId,
      orderId,
      action: 'resolve_without_production',
      reason: 'processor_not_in_use',
      note: null,
      confirmReviewedFacts: false,
      expectedVersion: 1,
      idempotencyKey: 'resolution-command-1',
      actorId,
    });
  });

  it('rejects source-owned or undeclared lifecycle input before authorization', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/orders/${orderId}/resolution`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_without_production',
          reason: 'source_says_completed',
          sourceStatus: 'COMPLETED',
          expectedVersion: 1,
          idempotencyKey: 'resolution-command-1',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.changeResolution).not.toHaveBeenCalled();
  });

  it('rejects an unexplained other reason before authorization', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/orders/${orderId}/resolution`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          reason: 'other',
          expectedVersion: 2,
          idempotencyKey: 'resolution-other-1',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.changeResolution).not.toHaveBeenCalled();
  });
});

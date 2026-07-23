import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, { type ErrorRequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChangeProductionAdmissionRoute } from '../../src/change-production-admission/change-production-admission.route.ts';

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
  const changeAdmission = vi.fn(async (command) =>
    result.ok({
      locationId: command.locationId,
      orderId: command.orderId,
      admissionOverride:
        command.target === 'released' ? ('released' as const) : null,
      status:
        command.target === 'released'
          ? ('intake_pending' as const)
          : ('release_pending' as const),
      version: command.expectedVersion + 1,
      replayed: false,
    }),
  );
  const authenticate = vi.fn((_request, _response, next) => next());
  const authorize = vi.fn((_request, _response, next) => next());
  const app = express();
  app.use(express.json());
  app.use(
    makeChangeProductionAdmissionRoute({
      changeAdmission,
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
  return { app, changeAdmission, authenticate, authorize };
};

describe('change production admission HTTP boundary', () => {
  it('maps strict input and the authenticated actor into a Pressly admission command', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/orders/${orderId}/admission`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'released',
          expectedVersion: 1,
          idempotencyKey: 'admission-command-1',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        locationId,
        orderId,
        admissionOverride: 'released',
        status: 'intake_pending',
        version: 2,
      },
    });
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).toHaveBeenCalledOnce();
    expect(harness.changeAdmission).toHaveBeenCalledWith({
      locationId,
      orderId,
      target: 'released',
      expectedVersion: 1,
      idempotencyKey: 'admission-command-1',
      actorId,
    });
  });

  it('rejects undeclared or unsupported admission input before authorization', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/${locationId}/orders/${orderId}/admission`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'in_progress',
          expectedVersion: 1,
          idempotencyKey: 'admission-command-1',
          sourceStatus: 'IN_PROGRESS',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).not.toHaveBeenCalled();
    expect(harness.changeAdmission).not.toHaveBeenCalled();
  });
});

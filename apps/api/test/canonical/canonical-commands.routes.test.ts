import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeOrderManagementRoutes } from '../../src/http/order-management/order-management.route.ts';

const servers: Server[] = [];
const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const security = () => ({
  authenticate: vi.fn<RequestHandler>((_request, _response, next) => next()),
  authorizeUsers: vi.fn<RequestHandler>((_request, _response, next) => next()),
  authorizeOrders: vi.fn<RequestHandler>((_request, _response, next) => next()),
  readPrincipal: vi.fn(() => ({
    identityId: id(90),
    kind: 'human' as const,
  })),
});

const applications = () => {
  const createUser = vi.fn(async () => ({
    tag: 'ok' as const,
    value: { userId: id(1), version: 1, replayed: false },
  }));
  const updateUser = vi.fn(async () => ({
    tag: 'ok' as const,
    value: { userId: id(1), version: 2, replayed: false },
  }));
  const createOrder = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 1,
      replayed: false,
    },
  }));
  const updateOrder = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 2,
      replayed: false,
    },
  }));
  const changeFulfillmentRelease = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 2,
      replayed: false,
    },
  }));
  return {
    users: { createUser, updateUser },
    orders: { createOrder, updateOrder, changeFulfillmentRelease },
    createUser,
    createOrder,
  };
};

const makeApp = (input: {
  applications: ReturnType<typeof applications>;
  security: ReturnType<typeof security>;
}) => {
  const app = express();
  app.use(express.json());
  app.use(
    makeOrderManagementRoutes({
      users: input.applications.users,
      orders: input.applications.orders,
      ...input.security,
    }),
  );
  app.use(((error, _request, response, _next) => {
    const status =
      error !== null && typeof error === 'object' && 'status' in error
        ? Number(error.status)
        : 500;
    const code =
      error !== null && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'unexpected';
    response.status(status).json({ code });
  }) satisfies ErrorRequestHandler);
  return app;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe('canonical command routes', () => {
  it('derives mutation provenance from the authenticated principal', async () => {
    const apps = applications();
    const guards = security();
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(`${base}/order-management/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'create-user-001',
        profile: {
          firstName: 'Ada',
          lastName: 'Rivera',
          businessName: null,
          phone: '+12015550101',
          email: null,
        },
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        userId: id(1),
        version: 1,
        replayed: false,
      },
    });
    expect(apps.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          origin: 'pressly_processor',
          principal: { kind: 'human', id: id(90) },
        },
      }),
    );
  });

  it('rejects an Order whose fulfillment targets another location', async () => {
    const apps = applications();
    const base = await start(
      makeApp({ applications: apps, security: security() }),
    );
    const response = await fetch(
      `${base}/order-management/locations/east/orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'create-order-001',
          customer: { resolution: 'not_provided', userId: null },
          displayNumber: 'P-1001',
          state: 'open',
          dueAt: '2026-07-22T20:00:00.000Z',
          currency: 'USD',
          totalAmountCents: 3000,
          balanceDueCents: 3000,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'west',
            releaseState: 'unreleased',
            estimatedWeightLbs: null,
            estimatedWeightSource: null,
            bagCount: null,
          },
        }),
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: 'order_location_mismatch',
    });
    expect(apps.createOrder).not.toHaveBeenCalled();
  });

  it('does not reach canonical mutations when authorization rejects the request', async () => {
    const apps = applications();
    const guards = security();
    guards.authorizeUsers.mockImplementation((_request, response) => {
      response.sendStatus(403);
    });
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(`${base}/order-management/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'create-user-002',
        profile: {
          firstName: null,
          lastName: null,
          businessName: 'Pressly Test',
          phone: null,
          email: null,
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(apps.createUser).not.toHaveBeenCalled();
  });
});

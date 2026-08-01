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
const businessId = id(91);

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const security = () => ({
  authenticate: vi.fn<RequestHandler>((_request, _response, next) => next()),
  authorizeOrders: vi.fn<RequestHandler>((_request, _response, next) => next()),
  readPrincipal: vi.fn(() => ({
    identityId: id(90),
    kind: 'human' as const,
  })),
});

const applications = () => {
  const createOrder = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 1,
      replayed: false,
    },
  }));
  const correctOrder = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 2,
      replayed: false,
    },
  }));
  const completeOrder = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 2,
      replayed: false,
    },
  }));
  const cancelOrder = vi.fn(completeOrder);
  const releaseFulfillment = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId: id(2),
      fulfillmentId: id(3),
      version: 2,
      replayed: false,
    },
  }));
  const withdrawFulfillment = vi.fn(releaseFulfillment);
  const listIncomingOrderProposals = vi.fn(async () => ({
    tag: 'ok' as const,
    value: { items: [], nextCursor: null },
  }));
  const acceptIncomingOrderProposal = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(4),
      state: 'accepted' as const,
      version: 2 as const,
      orderId: id(2),
      fulfillmentId: id(3),
      replayed: false,
    },
  }));
  const rejectIncomingOrderProposal = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(4),
      state: 'rejected' as const,
      version: 2 as const,
      orderId: null,
      fulfillmentId: null,
      replayed: false,
    },
  }));
  const restoreIncomingOrderProposal = vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(4),
      state: 'restored_pending' as const,
      version: 3,
      replayed: false,
    },
  }));
  return {
    orders: {
      createOrder,
      correctOrder,
      completeOrder,
      cancelOrder,
      releaseFulfillment,
      withdrawFulfillment,
      listIncomingOrderProposals,
      acceptIncomingOrderProposal,
      rejectIncomingOrderProposal,
      restoreIncomingOrderProposal,
    },
    createOrder,
    correctOrder,
    completeOrder,
    cancelOrder,
    releaseFulfillment,
    withdrawFulfillment,
    listIncomingOrderProposals,
    acceptIncomingOrderProposal,
    rejectIncomingOrderProposal,
    restoreIncomingOrderProposal,
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
      orders: input.applications.orders,
      ...input.security,
      resolveBusinessId: async () => businessId,
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
  it('derives business ancestry and mutation provenance on direct Order creation', async () => {
    const apps = applications();
    const guards = security();
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(
      `${base}/order-management/locations/east/orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'create-order-provenance-001',
          reasonCode: 'new_customer_order',
          reasonNote: null,
          customer: { resolution: 'not_provided', userId: null },
          displayNumber: 'P-1001',
          dueAt: '2026-07-22T20:00:00.000Z',
          currency: 'USD',
          totalAmountCents: 3000,
          balanceDueCents: 3000,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'east',
            estimatedWeightLbs: null,
            estimatedWeightSource: null,
          },
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        orderId: id(2),
        fulfillmentId: id(3),
        version: 1,
        replayed: false,
      },
    });
    expect(apps.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
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
          reasonCode: 'new_customer_order',
          reasonNote: null,
          customer: { resolution: 'not_provided', userId: null },
          displayNumber: 'P-1001',
          dueAt: '2026-07-22T20:00:00.000Z',
          currency: 'USD',
          totalAmountCents: 3000,
          balanceDueCents: 3000,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'west',
            estimatedWeightLbs: null,
            estimatedWeightSource: null,
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

  it('rejects lifecycle and physical truth on direct Order creation', async () => {
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
          idempotencyKey: 'create-order-with-lifecycle',
          reasonCode: 'new_customer_order',
          reasonNote: null,
          customer: { resolution: 'not_provided', userId: null },
          displayNumber: 'P-1001',
          state: 'completed',
          dueAt: '2026-07-22T20:00:00.000Z',
          currency: 'USD',
          totalAmountCents: 3000,
          balanceDueCents: 3000,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'east',
            releaseState: 'released',
            bagCount: 2,
            estimatedWeightLbs: null,
            estimatedWeightSource: null,
          },
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'invalid_body_type',
    });
    expect(apps.createOrder).not.toHaveBeenCalled();
  });

  it('maps an explicit complete event to the canonical lifecycle command', async () => {
    const apps = applications();
    const guards = security();
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(
      `${base}/order-management/locations/east/orders/${id(2)}/complete`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'complete-order-001',
          expectedVersion: 1,
          reasonCode: 'service_completed',
          reasonNote: null,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(apps.completeOrder).toHaveBeenCalledWith({
      businessId,
      idempotencyKey: 'complete-order-001',
      expectedVersion: 1,
      reasonCode: 'service_completed',
      reasonNote: null,
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: id(90) },
      },
      locationId: 'east',
      orderId: id(2),
    });
  });

  it('maps exhaustive descriptive correction without lifecycle or intake fields', async () => {
    const apps = applications();
    const guards = security();
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(
      `${base}/order-management/locations/east/orders/${id(2)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'correct-order-claims',
          expectedOrderVersion: 1,
          expectedFulfillmentVersion: 1,
          reasonCode: 'source_discrepancy',
          reasonNote: 'Manager verified the physical order record.',
          changes: {
            items: [
              {
                lineKey: 'wash-fold',
                itemType: 'service',
                code: 'WF',
                description: 'Wash and fold',
                quantity: 1,
                unit: 'order',
                unitPriceCents: 3000,
                totalAmountCents: 3000,
                sourceMetadata: {},
              },
            ],
            fulfillment: {
              typeCode: 'wash_fold',
              locationId: 'east',
              estimatedWeight: {
                lbs: 18,
                source: 'manager_estimate',
              },
            },
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(apps.correctOrder).toHaveBeenCalledWith({
      businessId,
      idempotencyKey: 'correct-order-claims',
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 1,
      reasonCode: 'source_discrepancy',
      reasonNote: 'Manager verified the physical order record.',
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: id(90) },
      },
      locationId: 'east',
      orderId: id(2),
      changes: {
        items: [
          {
            lineKey: 'wash-fold',
            itemType: 'service',
            code: 'WF',
            description: 'Wash and fold',
            quantity: 1,
            unit: 'order',
            unitPriceCents: 3000,
            totalAmountCents: 3000,
            sourceMetadata: {},
          },
        ],
        fulfillment: {
          typeCode: 'wash_fold',
          locationId: 'east',
          estimatedWeight: {
            lbs: 18,
            source: 'manager_estimate',
          },
        },
      },
    });
  });

  it('requires both versions and maps release without a caller-selected target', async () => {
    const apps = applications();
    const guards = security();
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(
      `${base}/order-management/locations/east/fulfillments/${id(3)}/release`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'release-fulfillment-001',
          expectedOrderVersion: 1,
          expectedFulfillmentVersion: 1,
          reasonCode: 'ready_for_production',
          reasonNote: null,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(apps.releaseFulfillment).toHaveBeenCalledWith({
      businessId,
      idempotencyKey: 'release-fulfillment-001',
      expectedOrderVersion: 1,
      expectedFulfillmentVersion: 1,
      reasonCode: 'ready_for_production',
      reasonNote: null,
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: id(90) },
      },
      fulfillmentId: id(3),
      locationId: 'east',
    });
  });

  it('does not reach an Order command when Order scope authorization rejects it', async () => {
    const apps = applications();
    const guards = security();
    guards.authorizeOrders.mockImplementation((_request, response) => {
      response.sendStatus(403);
    });
    const base = await start(makeApp({ applications: apps, security: guards }));
    const response = await fetch(
      `${base}/order-management/locations/east/orders/${id(2)}/complete`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'complete-order-denied',
          expectedVersion: 1,
          reasonCode: 'service_completed',
          reasonNote: null,
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(apps.completeOrder).not.toHaveBeenCalled();
  });
});

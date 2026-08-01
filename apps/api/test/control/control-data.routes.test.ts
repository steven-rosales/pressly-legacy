import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAppError } from '@pressly/errors';
import type { OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeControlCustomerRoutes } from '../../src/http/control/data/control-customer.route.ts';
import { makeControlOrderRoutes } from '../../src/http/control/data/control-order.route.ts';

const businessId = '00000000-0000-4000-8000-000000000100';
const identityId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000010';
const orderId = '00000000-0000-4000-8000-000000000020';
const fulfillmentId = '00000000-0000-4000-8000-000000000030';
const now = new Date('2026-07-29T16:00:00.000Z');
const pass: RequestHandler = (_request, _response, next) => next();
const authenticate: RequestHandler = (_request, response, next) => {
  response.locals['auth'] = {
    principal: { identityId, kind: 'human' },
  };
  response.locals['controlAccess'] = {
    business: { id: businessId, name: 'Pressly One' },
    locations: [{ id: 'east', name: 'East', timezone: 'America/New_York' }],
  };
  next();
};
const servers: Server[] = [];

afterEach(async () => {
  vi.clearAllMocks();
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
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

const users = {
  listUsers: vi.fn(async () => ({
    tag: 'ok' as const,
    value: { items: [], nextCursor: null },
  })),
  getUser: vi.fn(),
  createUser: vi.fn(async () => ({
    tag: 'ok' as const,
    value: { userId: customerId, version: 1, replayed: false },
  })),
  updateUser: vi.fn(),
} as unknown as UsersApplication;

const orders = {
  listCanonicalOrders: vi.fn(async () => ({
    tag: 'ok' as const,
    value: { items: [], nextCursor: null },
  })),
  getCanonicalOrder: vi.fn(async () => ({
    tag: 'ok' as const,
    value: {
      orderId,
      businessId,
      orderVersion: 1,
      fulfillmentId,
      fulfillmentVersion: 1,
      displayNumber: 'P-100',
      state: 'open' as const,
      dueAt: now,
      currency: 'USD',
      totalAmountCents: 0,
      balanceDueCents: 0,
      customer: {
        resolution: 'resolved' as const,
        userId: customerId,
        displayName: 'Ada',
        phone: null,
        email: null,
      },
      fulfillment: {
        typeCode: 'wash_fold',
        locationId: 'east',
        releaseState: 'unreleased' as const,
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
        bagCount: null,
      },
      createdAt: now,
      updatedAt: now,
      items: [],
    },
  })),
  createOrder: vi.fn(async () => ({
    tag: 'ok' as const,
    value: { orderId, fulfillmentId, version: 1, replayed: false },
  })),
  correctOrder: vi.fn(),
} as unknown as OrdersApplication;

const app = () => {
  const value = express();
  value.use(express.json());
  value.use(
    '/control',
    makeControlCustomerRoutes({
      users,
      authenticate,
      limitIdentity: pass,
      requireRead: pass,
      requireWrite: pass,
    }),
  );
  value.use(
    '/control',
    makeControlOrderRoutes({
      orders,
      authenticate,
      limitIdentity: pass,
      requireRead: pass,
      requireWrite: pass,
    }),
  );
  value.use(errorHandler);
  return value;
};

describe('Control customer and Order routes', () => {
  it('injects server business and actor context into customer creation', async () => {
    const baseUrl = await start(app());
    const response = await fetch(`${baseUrl}/control/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'customer-create-001',
        profile: {
          firstName: 'Ada',
          lastName: null,
          businessName: null,
          phone: null,
          email: null,
        },
      }),
    });
    expect(response.status).toBe(201);
    expect(users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        context: {
          origin: 'pressly_control',
          principal: { kind: 'human', id: identityId },
        },
      }),
    );
  });

  it('keeps cross-location Order filters indistinguishable from missing data', async () => {
    const baseUrl = await start(app());
    const response = await fetch(`${baseUrl}/control/orders?locationId=west`);
    expect(response.status).toBe(404);
    expect(orders.listCanonicalOrders).not.toHaveBeenCalled();
  });

  it('creates one source-neutral unreleased fulfillment with an exact customer ID', async () => {
    const baseUrl = await start(app());
    const response = await fetch(`${baseUrl}/control/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'order-create-001',
        reasonCode: 'new_customer_order',
        reasonNote: null,
        customer: { resolution: 'resolved', userId: customerId },
        displayNumber: 'P-100',
        dueAt: now.toISOString(),
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
    });
    expect(response.status).toBe(201);
    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customer: {
          resolution: 'resolved',
          userId: customerId,
          externalUserId: null,
        },
        fulfillment: expect.objectContaining({ locationId: 'east' }),
      }),
    );
  });

  it('rejects unidentified first-party Orders before reaching the canonical command', async () => {
    const baseUrl = await start(app());
    const response = await fetch(`${baseUrl}/control/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'order-create-unidentified',
        reasonCode: 'new_customer_order',
        reasonNote: null,
        customer: { resolution: 'not_provided', userId: null },
        displayNumber: 'P-101',
        dueAt: now.toISOString(),
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
    });
    expect(response.status).toBe(400);
    expect(orders.createOrder).not.toHaveBeenCalled();
  });
});

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OrdersApplication } from '@pressly/orders';
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeIncomingOrderProposalRoutes } from '../../src/http/order-management/orders/incoming-order-proposal.route.ts';

const servers: Server[] = [];
const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const applications = () => {
  const listIncomingOrderProposals = vi.fn<
    OrdersApplication['listIncomingOrderProposals']
  >(async () => ({
    tag: 'ok' as const,
    value: {
      items: [
        {
          id: id(1),
          version: 1 as const,
          state: 'pending' as const,
          source: 'cents',
          externalOrderId: 'cents-101',
          locationId: 'east',
          displayNumber: '101',
          customer: {
            displayName: 'Santiago Jackson',
            phone: '+18622917798',
            email: null,
          },
          dueAt: new Date('2026-07-29T20:00:00.000Z'),
          estimatedWeightLbs: 17,
          sourceReportedAt: new Date('2026-07-28T18:00:00.000Z'),
          reportedAt: new Date('2026-07-28T18:00:01.000Z'),
          sourceClosure: null,
          availableActions: ['accept', 'reject'] as const,
          acceptBlockedReason: null,
        },
      ],
      nextCursor: 'next-page',
    },
  }));
  const acceptIncomingOrderProposal = vi.fn<
    OrdersApplication['acceptIncomingOrderProposal']
  >(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(1),
      state: 'accepted' as const,
      version: 2 as const,
      orderId: id(2),
      fulfillmentId: id(3),
      replayed: false,
    },
  }));
  const rejectIncomingOrderProposal = vi.fn<
    OrdersApplication['rejectIncomingOrderProposal']
  >(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(1),
      state: 'rejected' as const,
      version: 2 as const,
      orderId: null,
      fulfillmentId: null,
      replayed: false,
    },
  }));
  const restoreIncomingOrderProposal = vi.fn<
    OrdersApplication['restoreIncomingOrderProposal']
  >(async () => ({
    tag: 'ok' as const,
    value: {
      proposalId: id(1),
      state: 'restored_pending' as const,
      version: 3,
      replayed: false,
    },
  }));
  return {
    listIncomingOrderProposals,
    acceptIncomingOrderProposal,
    rejectIncomingOrderProposal,
    restoreIncomingOrderProposal,
  };
};

const makeApp = (input: {
  orders: ReturnType<typeof applications>;
  authorize?: RequestHandler;
}) => {
  const app = express();
  app.use(express.json());
  app.use(
    makeIncomingOrderProposalRoutes({
      orders: input.orders,
      authenticate: (_request, _response, next) => next(),
      authorize: input.authorize ?? ((_request, _response, next) => next()),
      readPrincipal: () => ({
        identityId: id(90),
        kind: 'human',
      }),
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

describe('incoming Order proposal routes', () => {
  it('lists one location-scoped page with serialized timestamps', async () => {
    const orders = applications();
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders?limit=10&cursor=current-page`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        items: [
          expect.objectContaining({
            id: id(1),
            locationId: 'east',
            dueAt: '2026-07-29T20:00:00.000Z',
            sourceReportedAt: '2026-07-28T18:00:00.000Z',
            reportedAt: '2026-07-28T18:00:01.000Z',
            sourceClosure: null,
            availableActions: ['accept', 'reject'],
            acceptBlockedReason: null,
          }),
        ],
        nextCursor: 'next-page',
      },
    });
    expect(orders.listIncomingOrderProposals).toHaveBeenCalledWith({
      locationId: 'east',
      limit: 10,
      cursor: 'current-page',
      view: 'needs_review',
    });
  });

  it('rejects an invalid page before calling Orders', async () => {
    const orders = applications();
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders?limit=101`,
    );

    expect(response.status).toBe(400);
    expect(orders.listIncomingOrderProposals).not.toHaveBeenCalled();
  });

  it('maps an authorized acceptance to an actor-attributed command', async () => {
    const orders = applications();
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders/${id(1)}/accept`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          idempotencyKey: 'accept-proposal-1',
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { proposalId: id(1), state: 'accepted', replayed: false },
    });
    expect(orders.acceptIncomingOrderProposal).toHaveBeenCalledWith({
      proposalId: id(1),
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'accept-proposal-1',
      reasonCode: 'incoming_order_accepted',
      reasonNote: null,
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: id(90) },
      },
    });
  });

  it('maps a reasoned rejection without creating canonical identifiers', async () => {
    const orders = applications();
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders/${id(1)}/reject`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          idempotencyKey: 'reject-proposal-1',
          reasonCode: 'already_handled',
          reasonNote: 'Already completed before Processor adoption.',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        proposalId: id(1),
        state: 'rejected',
        orderId: null,
        fulfillmentId: null,
      },
    });
    expect(orders.rejectIncomingOrderProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: id(1),
        locationId: 'east',
        reasonCode: 'already_handled',
      }),
    );
  });

  it('maps a source-closure override to the manager-owned restore command', async () => {
    const orders = applications();
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders/${id(1)}/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 2,
          idempotencyKey: 'restore-proposal-1',
          reasonCode: 'source_closure_overridden',
          reasonNote: 'Physical work is still here.',
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        proposalId: id(1),
        state: 'restored_pending',
        version: 3,
        replayed: false,
      },
    });
    expect(orders.restoreIncomingOrderProposal).toHaveBeenCalledWith({
      proposalId: id(1),
      locationId: 'east',
      expectedVersion: 2,
      idempotencyKey: 'restore-proposal-1',
      reasonCode: 'source_closure_overridden',
      reasonNote: 'Physical work is still here.',
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: id(90) },
      },
    });
  });

  it('does not invoke Orders when authorization denies access', async () => {
    const orders = applications();
    const base = await start(
      makeApp({
        orders,
        authorize: (_request, response) => {
          response.status(403).json({ code: 'forbidden' });
        },
      }),
    );
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders`,
    );

    expect(response.status).toBe(403);
    expect(orders.listIncomingOrderProposals).not.toHaveBeenCalled();
  });

  it('authorizes proposal scope before parsing a malformed command body', async () => {
    const orders = applications();
    const base = await start(
      makeApp({
        orders,
        authorize: (_request, response) => {
          response.status(403).json({ code: 'forbidden' });
        },
      }),
    );
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders/${id(1)}/accept`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    );

    expect(response.status).toBe(403);
    expect(orders.acceptIncomingOrderProposal).not.toHaveBeenCalled();
  });

  it('preserves typed stale-version failures from Orders', async () => {
    const orders = applications();
    orders.acceptIncomingOrderProposal.mockResolvedValueOnce({
      tag: 'err',
      error: {
        kind: 'conflict',
        code: 'incoming_order_proposal_version_conflict',
        message: 'This incoming order changed.',
      },
    });
    const base = await start(makeApp({ orders }));
    const response = await fetch(
      `${base}/order-management/locations/east/incoming-orders/${id(1)}/accept`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: 1,
          idempotencyKey: 'accept-proposal-2',
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
        }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'incoming_order_proposal_version_conflict',
    });
  });
});

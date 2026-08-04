import { result } from '@pressly/kernel';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  listProductionOrdersBoundary,
  makeListProductionOrdersController,
} from '../../../../src/features/orders/list-orders/list-production-orders.controller.ts';
import type { ListProductionOrders } from '../../../../src/features/orders/list-orders/list-production-orders.port.ts';
import { makeListProductionOrdersRoute } from '../../../../src/features/orders/list-orders/list-production-orders.route.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{
    path: string;
    stack: readonly Readonly<{ handle: RequestHandler }>[];
  }>;
}>;

const page = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      locationId: 'location-a',
      externalOrderId: 'C-1001',
      dueAt: new Date('2026-07-12T20:00:00.000Z'),
      dueBucket: 'today' as const,
      priority: false,
      status: 'intake_pending' as const,
      derivedWeightLbs: 74,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
      version: 1,
    },
  ],
  nextCursor: null,
  asOf: new Date('2026-07-12T14:00:00.000Z'),
};

const runController = async (input: {
  controller: RequestHandler;
  request: Request;
  response: ReturnType<typeof makeHttpResponse>;
  next: NextFunction;
}): Promise<void> => {
  listProductionOrdersBoundary.validate(
    input.request,
    input.response as unknown as Response,
    (error?: unknown) => {
      if (error !== undefined) {
        input.next(error);
        return;
      }
      input.controller(
        input.request,
        input.response as unknown as Response,
        input.next,
      );
    },
  );
  for (let turn = 0; turn < 4; turn += 1) await waitForController();
};

describe('list production orders HTTP boundary', () => {
  it('parses the request inward and validates the serialized response', async () => {
    const listOrders = vi
      .fn<ListProductionOrders>()
      .mockResolvedValue(result.ok(page));
    const controller = makeListProductionOrdersController(listOrders);
    const request = {
      params: { locationId: 'location-a' },
      query: {
        status: 'intake_pending',
        dueAfter: '2026-07-12T12:00:00.000Z',
        dueBefore: '2026-07-13T12:00:00.000Z',
        limit: '25',
      },
    } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    await runController({ controller, request, response, next });

    expect(listOrders).toHaveBeenCalledWith({
      locationId: 'location-a',
      status: 'intake_pending',
      dueAfter: new Date('2026-07-12T12:00:00.000Z'),
      dueBefore: new Date('2026-07-13T12:00:00.000Z'),
      limit: 25,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        items: [
          {
            ...page.items[0],
            dueAt: '2026-07-12T20:00:00.000Z',
          },
        ],
        nextCursor: null,
        asOf: '2026-07-12T14:00:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves the URL and authenticate-validate-authorize order', () => {
    const authenticate: RequestHandler = vi.fn((_request, _response, next) =>
      next(),
    );
    const authorize: RequestHandler = vi.fn((_request, _response, next) =>
      next(),
    );
    const listOrders = vi
      .fn<ListProductionOrders>()
      .mockResolvedValue(result.ok(page));
    const router = makeListProductionOrdersRoute({
      listOrders,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };
    const route = router.stack[0]?.route;

    expect(route?.path).toBe('/production/locations/:locationId/orders');
    expect(route?.stack).toHaveLength(4);
    expect(route?.stack[0]?.handle).toBe(authenticate);
    expect(route?.stack[2]?.handle).toBe(authorize);
  });
});

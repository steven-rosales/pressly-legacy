import { result } from '@pressly/kernel';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import {
  loadPricingCatalogBoundary,
  makeLoadPricingCatalogController,
} from '../../../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.controller.ts';
import { makeLoadPricingCatalogRoute } from '../../../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.route.ts';
import type { LoadPricingCatalog } from '../../../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.usecase.ts';

type RouteLayer = Readonly<{ handle: unknown }>;
type ExpressRoute = Readonly<{
  path: string;
  methods: Record<string, boolean>;
  stack: RouteLayer[];
}>;
type RouterWithStack = Readonly<{
  stack: Array<Readonly<{ route?: ExpressRoute }>>;
}>;

const getRoutes = (router: unknown): ExpressRoute[] =>
  (router as RouterWithStack).stack
    .map((layer) => layer.route)
    .filter((route): route is ExpressRoute => route !== undefined);

const runMiddleware = (
  middleware: RequestHandler,
  req: Request,
  res: Response,
): Promise<void> =>
  new Promise((resolve, reject) => {
    middleware(req, res, (error?: unknown) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });

describe('load pricing catalog http controller', () => {
  it('returns a success envelope for global pricing', async () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: new Date('2026-05-21T12:00:00.000Z'),
        items: [],
      }),
    );

    const controller = makeLoadPricingCatalogController(loadPricingCatalog);
    const req = {
      params: {
        serviceSlug: 'wash-fold',
      },
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      loadPricingCatalogBoundary.validate,
      req,
      res as unknown as Response,
    );
    controller(req, res as unknown as Response, next as NextFunction);
    await waitForController();

    expect(loadPricingCatalog).toHaveBeenCalledWith({
      serviceSlug: 'wash-fold',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: '2026-05-21T12:00:00.000Z',
        items: [],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('maps expected catalog failures to the http error boundary', async () => {
    const failure = {
      code: 'pricing_not_found',
      serviceSlug: 'wash-fold',
      missing: 'service',
    } as const;
    const loadPricingCatalog = vi
      .fn<LoadPricingCatalog>()
      .mockResolvedValue(result.err(failure));
    const controller = makeLoadPricingCatalogController(loadPricingCatalog);
    const req = {
      params: {
        serviceSlug: 'wash-fold',
      },
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      loadPricingCatalogBoundary.validate,
      req,
      res as unknown as Response,
    );
    controller(req, res as unknown as Response, next as NextFunction);
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      tag: 'AppError',
      kind: 'NotFoundError',
      code: 'pricing_not_found',
      status: 404,
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('load pricing catalog http route', () => {
  it('registers the public pricing catalog route', () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: new Date('2026-05-21T12:00:00.000Z'),
        items: [],
      }),
    );
    const router = makeLoadPricingCatalogRoute({
      loadPricingCatalog,
    });
    const routes = getRoutes(router);

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      path: '/services/:serviceSlug/pricing',
      methods: { get: true },
    });
    expect(routes[0]?.stack).toHaveLength(2);
  });
});

import { result } from '@pressly/kernel';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeHttpResponse } from '@pressly/testkit/http';
import { makeLoadPricingCatalogController } from '../../../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.controller.ts';
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

    await runMiddleware(controller.validate, req, res as unknown as Response);
    await controller.handle(req, res as unknown as Response, next);

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

    await runMiddleware(controller.validate, req, res as unknown as Response);
    await expect(
      controller.handle(req, res as unknown as Response, next),
    ).rejects.toMatchObject({
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

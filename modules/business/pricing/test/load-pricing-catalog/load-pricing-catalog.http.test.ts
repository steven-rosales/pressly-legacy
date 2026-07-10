import { result } from '@pressly/kernel';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeAppError } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeLoadPricingCatalogController } from '../../src/load-pricing-catalog/load-pricing-catalog.controller.ts';
import { makeLoadPricingCatalogRoute } from '../../src/load-pricing-catalog/load-pricing-catalog.route.ts';
import type { LoadPricingCatalog } from '../../src/load-pricing-catalog/load-pricing-catalog.usecase.ts';

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

describe('load pricing catalog http controller', () => {
  it('returns a success envelope for global pricing', async () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: '2026-05-21T12:00:00.000Z',
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
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
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

  it('returns a failure envelope from usecase errors', async () => {
    const error = makeAppError({
      kind: 'NotFoundError',
      code: 'pricing_not_found',
      message: 'Internal pricing details.',
      safeMessage: 'Pricing is not available.',
      status: 404,
    });
    const loadPricingCatalog = vi
      .fn<LoadPricingCatalog>()
      .mockResolvedValue(result.err(error));
    const controller = makeLoadPricingCatalogController(loadPricingCatalog);
    const req = {
      params: {
        serviceSlug: 'wash-fold',
      },
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'pricing_not_found',
        message: 'Pricing is not available.',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('load pricing catalog http route', () => {
  it('registers the public pricing catalog route', () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        currency: 'USD',
        updatedAt: '2026-05-21T12:00:00.000Z',
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

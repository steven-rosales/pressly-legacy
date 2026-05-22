import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { err, makeAppError, ok } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makeLoadPricingCatalogController } from '../../src/adapters/load-pricing-catalog/http/load-pricing-catalog.controller.ts';
import type { LoadPricingCatalog } from '../../src/features/load-pricing-catalog/load-pricing-catalog.usecase.ts';

describe('load pricing catalog http controller', () => {
  it('returns a success envelope for global pricing', async () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      ok({
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

  it('includes location scope when route params contain a location', async () => {
    const loadPricingCatalog = vi.fn<LoadPricingCatalog>().mockResolvedValue(
      ok({
        serviceSlug: 'dry-cleaning',
        locationSlug: 'fort-lee',
        currency: 'USD',
        updatedAt: '2026-05-21T12:00:00.000Z',
        items: [],
      }),
    );
    const controller = makeLoadPricingCatalogController(loadPricingCatalog);
    const req = {
      params: {
        serviceSlug: 'dry-cleaning',
        locationSlug: 'fort-lee',
      },
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(loadPricingCatalog).toHaveBeenCalledWith({
      serviceSlug: 'dry-cleaning',
      locationSlug: 'fort-lee',
    });
    expect(res.status).toHaveBeenCalledWith(200);
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
      .mockResolvedValue(err(error));
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

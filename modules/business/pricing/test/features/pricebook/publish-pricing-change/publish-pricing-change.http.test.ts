import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  makePublishPricingChangeController,
  publishPricingChangeBoundary,
} from '../../../../src/features/pricebook/publish-pricing-change/publish-pricing-change.controller.ts';
import { makePublishPricingChangeRoute } from '../../../../src/features/pricebook/publish-pricing-change/publish-pricing-change.route.ts';
import type { PublishPricingChange } from '../../../../src/features/pricebook/publish-pricing-change/publish-pricing-change.usecase.ts';
import {
  makePricingChangeAuthor,
  makePricingChangeCommand,
} from '../../../support/pricing-change.builder.ts';

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
  request: Request,
  response: Response,
): Promise<void> =>
  new Promise((resolve, reject) => {
    middleware(request, response, (error?: unknown) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });

describe('publish pricing change http boundary', () => {
  it('maps the contract command and validates the response contract', async () => {
    const command = makePricingChangeCommand();
    const { requestedBy, ...body } = command;
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockResolvedValue(
        result.ok({
          oldPricingSetId: 'set_1',
          newPricingSetId: 'set_2',
          auditEventId: 'event_1',
          changeItemCount: 1,
        }),
      );
    const controller = makePublishPricingChangeController({
      publishPricingChange,
      readAuthor: () => requestedBy,
    });
    const request = { body } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      publishPricingChangeBoundary.validate,
      request,
      response as unknown as Response,
    );
    controller(request, response as unknown as Response, next as NextFunction);
    await waitForController();

    expect(publishPricingChange).toHaveBeenCalledWith(command);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        oldPricingSetId: 'set_1',
        newPricingSetId: 'set_2',
        auditEventId: 'event_1',
        changeItemCount: 1,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('translates expected state conflicts at the controller edge', async () => {
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockResolvedValue(
        result.err({
          code: 'pricing_state_changed',
          expectedPricingSetId: 'set_1',
          actualPricingSetId: 'set_2',
        }),
      );
    const controller = makePublishPricingChangeController({
      publishPricingChange,
      readAuthor: () => makePricingChangeAuthor(),
    });
    const request = {
      body: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
    } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      publishPricingChangeBoundary.validate,
      request,
      response as unknown as Response,
    );
    controller(request, response as unknown as Response, next as NextFunction);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      tag: 'AppError',
      kind: 'ConflictError',
      code: 'pricing_state_changed',
      status: 409,
    });
  });

  it('preserves unexpected mechanism errors as thrown AppErrors', async () => {
    const error = databaseError({
      code: 'pricing_publish_failed',
      message: 'Failed to publish pricing change.',
      safeMessage: 'Pricing change could not be published.',
    });
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockRejectedValue(error);
    const controller = makePublishPricingChangeController({
      publishPricingChange,
      readAuthor: () => makePricingChangeAuthor(),
    });
    const request = {
      body: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
    } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      publishPricingChangeBoundary.validate,
      request,
      response as unknown as Response,
    );
    controller(request, response as unknown as Response, next as NextFunction);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error));
  });

  it('registers only the protected publish route', () => {
    const publishPricingChange = vi.fn<PublishPricingChange>();
    const authenticate = vi.fn() as unknown as RequestHandler;
    const authorize = vi.fn() as unknown as RequestHandler;
    const routes = getRoutes(
      makePublishPricingChangeRoute({
        publishPricingChange,
        security: {
          authenticate,
          authorize,
          readAuthor: () => makePricingChangeAuthor(),
        },
      }),
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      path: '/changes/publish',
      methods: { post: true },
    });
    expect(routes[0]?.stack).toHaveLength(4);
    expect(routes[0]?.stack[1]?.handle).toBe(authenticate);
    expect(routes[0]?.stack[2]?.handle).toBe(authorize);
  });
});

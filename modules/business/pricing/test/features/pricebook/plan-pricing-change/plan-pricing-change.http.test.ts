import { result } from '@pressly/kernel';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  makePlanPricingChangeController,
  planPricingChangeBoundary,
} from '../../../../src/features/pricebook/plan-pricing-change/plan-pricing-change.controller.ts';
import { makePlanPricingChangeRoute } from '../../../../src/features/pricebook/plan-pricing-change/plan-pricing-change.route.ts';
import type { PlanPricingChange } from '../../../../src/features/pricebook/plan-pricing-change/plan-pricing-change.usecase.ts';
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

describe('plan pricing change http boundary', () => {
  it('maps the contract command and validates the response contract', async () => {
    const command = makePricingChangeCommand();
    const { requestedBy, ...body } = command;
    const planPricingChange = vi.fn<PlanPricingChange>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        reason: command.reason,
        oldPricingSetId: 'set_1',
        currency: 'USD',
        changes: [
          {
            code: 'delivery_fee',
            name: 'Delivery fee',
            oldPriceCents: 495,
            newPriceCents: 100,
          },
        ],
      }),
    );
    const controller = makePlanPricingChangeController({
      planPricingChange,
      readAuthor: () => requestedBy,
    });
    const request = { body } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      planPricingChangeBoundary.validate,
      request,
      response as unknown as Response,
    );
    controller(request, response as unknown as Response, next as NextFunction);
    await waitForController();

    expect(planPricingChange).toHaveBeenCalledWith(command);
    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        oldPricingSetId: 'set_1',
        currency: 'USD',
        changes: [
          {
            code: 'delivery_fee',
            name: 'Delivery fee',
            oldPriceCents: 495,
            newPriceCents: 100,
          },
        ],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('translates expected policy failures at the controller edge', async () => {
    const planPricingChange = vi.fn<PlanPricingChange>().mockResolvedValue(
      result.err({
        code: 'pricing_change_reason_too_short',
        violations: [
          {
            code: 'pricing_change_reason_too_short',
            minimumLength: 8,
            actualLength: 5,
          },
        ],
      }),
    );
    const controller = makePlanPricingChangeController({
      planPricingChange,
      readAuthor: () => makePricingChangeAuthor(),
    });
    const request = {
      body: {
        serviceSlug: 'wash-fold',
        reason: 'short',
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
    } as unknown as Request;
    const response = makeHttpResponse();
    const next = vi.fn();

    await runMiddleware(
      planPricingChangeBoundary.validate,
      request,
      response as unknown as Response,
    );
    controller(request, response as unknown as Response, next as NextFunction);

    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      tag: 'AppError',
      kind: 'ValidationError',
      code: 'pricing_change_reason_too_short',
      status: 400,
    });
  });

  it('registers only the protected plan route', () => {
    const planPricingChange = vi.fn<PlanPricingChange>();
    const authenticate = vi.fn() as unknown as RequestHandler;
    const authorize = vi.fn() as unknown as RequestHandler;
    const routes = getRoutes(
      makePlanPricingChangeRoute({
        planPricingChange,
        security: {
          authenticate,
          authorize,
          readAuthor: () => makePricingChangeAuthor(),
        },
      }),
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      path: '/changes/plan',
      methods: { post: true },
    });
    expect(routes[0]?.stack).toHaveLength(4);
    expect(routes[0]?.stack[1]?.handle).toBe(authenticate);
    expect(routes[0]?.stack[2]?.handle).toBe(authorize);
  });
});

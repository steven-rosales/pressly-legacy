import { result } from '@pressly/kernel';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeAppError } from '@pressly/errors';
import { makeHttpResponse, waitForController } from '@pressly/testkit/http';
import { makePublishPricingChangeRoute } from '../../src/adapters/publish-pricing/http/publish-pricing-change.route.ts';
import { makePublishPricingChangeController } from '../../src/adapters/publish-pricing/http/publish-pricing-change.controller.ts';
import type { PlanPricingChange } from '../../src/features/publish-pricing/plan-pricing-change.usecase.ts';
import type { PublishPricingChange } from '../../src/features/publish-pricing/publish-pricing-change.usecase.ts';
import {
  makePricingChangeAuthor,
  makePublishPricingChangeCommand,
} from '../support/builders.ts';

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

describe('publish pricing change http controller', () => {
  it('returns a success envelope for publish results', async () => {
    const command = makePublishPricingChangeCommand();
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
    const req = { body } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(publishPricingChange).toHaveBeenCalledWith(command);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
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

  it('returns a failure envelope from publish errors', async () => {
    const error = makeAppError({
      kind: 'PermissionError',
      code: 'missing_permission',
      message: 'Internal permission details.',
      safeMessage: 'You do not have permission to perform this action.',
      status: 403,
    });
    const publishPricingChange = vi
      .fn<PublishPricingChange>()
      .mockResolvedValue(result.err(error));
    const controller = makePublishPricingChangeController({
      publishPricingChange,
      readAuthor: () => makePricingChangeAuthor(),
    });
    const req = {
      body: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
    } as unknown as Request;
    const res = makeHttpResponse();
    const next = vi.fn() as NextFunction;

    controller(req, res as unknown as Response, next);
    await waitForController();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'missing_permission',
        message: 'You do not have permission to perform this action.',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('publish pricing change http route', () => {
  it('registers protected plan and publish routes', () => {
    const planPricingChange = vi.fn<PlanPricingChange>().mockResolvedValue(
      result.ok({
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        oldPricingSetId: 'set_1',
        currency: 'USD',
        changes: [],
      }),
    );
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
    const authenticate = vi.fn() as unknown as RequestHandler;
    const authorizePlan = vi.fn() as unknown as RequestHandler;
    const authorizePublish = vi.fn() as unknown as RequestHandler;
    const router = makePublishPricingChangeRoute({
      planPricingChange,
      publishPricingChange,
      auth: {
        authenticate,
        planPricingChange: authorizePlan,
        publishPricingChange: authorizePublish,
        readAuthor: vi.fn(() => makePricingChangeAuthor()),
      },
    });
    const routes = getRoutes(router);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      path: '/changes/plan',
      methods: { post: true },
    });
    expect(routes[1]).toMatchObject({
      path: '/changes/publish',
      methods: { post: true },
    });
    expect(routes[0]?.stack).toHaveLength(4);
    expect(routes[1]?.stack).toHaveLength(4);
    expect(routes[0]?.stack[1]?.handle).toBe(authenticate);
    expect(routes[0]?.stack[2]?.handle).toBe(authorizePlan);
    expect(routes[1]?.stack[1]?.handle).toBe(authenticate);
    expect(routes[1]?.stack[2]?.handle).toBe(authorizePublish);
  });
});

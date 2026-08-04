import {
  controlOrderDetailSchema,
  controlOrderListQuerySchema,
  controlOrderListSchema,
  controlCorrectOrderRequestSchema,
  controlCreateOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
import type { ControlExperience } from '@pressly/control-experience';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

const orderParamsSchema = z.object({ orderId: z.uuid() }).strict();

export const makeControlOrderRoutes = (input: {
  application: ControlExperience['orders'];
  authenticate: RequestHandler;
  limitIdentity: RequestHandler;
  requireRead: RequestHandler;
  requireWrite: RequestHandler;
}): Router => {
  const routes = Router();
  const read = [
    input.authenticate,
    input.limitIdentity,
    input.requireRead,
  ] as const;
  const write = [
    input.authenticate,
    input.limitIdentity,
    input.requireWrite,
  ] as const;

  routes.get(
    '/orders',
    ...read,
    validateRequest({ query: controlOrderListQuerySchema }),
    catchAsync(async (request, response) => {
      const query = request.query as unknown as {
        query?: string;
        state?: 'open' | 'completed' | 'canceled';
        locationId?: string;
        cursor?: string;
        limit: number;
      };
      const page = controlResultValue(
        await input.application.list({
          context: readControlRequestContext(response),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.state === undefined ? {} : { state: query.state }),
          ...(query.locationId === undefined
            ? {}
            : { locationId: query.locationId }),
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
      response.json(
        apiSuccess(
          controlOrderListSchema.parse({
            items: page.items,
            nextCursor: page.nextCursor,
          }),
        ),
      );
    }),
  );

  routes.get(
    '/orders/:orderId',
    ...read,
    validateRequest({ params: orderParamsSchema }),
    catchAsync(async (request, response) => {
      const order = controlResultValue(
        await input.application.get({
          context: readControlRequestContext(response),
          orderId: request.params['orderId'] as string,
        }),
      );
      response.json(apiSuccess(controlOrderDetailSchema.parse(order)));
    }),
  );

  routes.post(
    '/orders',
    ...write,
    validateRequest({ body: controlCreateOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = controlResultValue(
        await input.application.create({
          ...request.body,
          context: readControlRequestContext(response),
        }),
      );
      response
        .status(201)
        .json(apiSuccess(orderMutationResultSchema.parse(outcome)));
    }),
  );

  routes.patch(
    '/orders/:orderId',
    ...write,
    validateRequest({ params: orderParamsSchema }),
    validateRequest({ body: controlCorrectOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const orderId = request.params['orderId'] as string;
      const body = request.body;
      const outcome = controlResultValue(
        await input.application.correct({
          orderId,
          idempotencyKey: body.idempotencyKey,
          context: readControlRequestContext(response),
          reasonCode: body.reasonCode,
          reasonNote: body.reasonNote,
          expectedOrderVersion: body.expectedOrderVersion,
          expectedFulfillmentVersion: body.expectedFulfillmentVersion,
          changes: body.changes,
        }),
      );
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome)));
    }),
  );

  return routes;
};

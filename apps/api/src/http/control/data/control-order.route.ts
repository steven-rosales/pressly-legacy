import {
  controlOrderDetailSchema,
  controlOrderListQuerySchema,
  controlOrderListSchema,
  controlCorrectOrderRequestSchema,
  controlCreateOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrderCustomer, OrdersApplication } from '@pressly/orders';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  controlAccess,
  controlCommandContext,
  controlLocationIds,
} from './control-data.context.ts';
import { controlOrder, controlOrderDetail } from './control-data.mapper.ts';

const orderParamsSchema = z.object({ orderId: z.uuid() }).strict();

const directCustomer = (
  input:
    | Readonly<{ resolution: 'resolved'; userId: string }>
    | Readonly<{ resolution: 'not_provided'; userId: null }>,
): OrderCustomer =>
  input.resolution === 'resolved'
    ? {
        resolution: 'resolved',
        userId: input.userId,
        externalUserId: null,
      }
    : {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      };

const value = <Value>(
  outcome:
    | Readonly<{ tag: 'ok'; value: Value }>
    | Readonly<{ tag: 'err'; error: unknown }>,
): Value => {
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

export const makeControlOrderRoutes = (input: {
  orders: Pick<
    OrdersApplication,
    'listCanonicalOrders' | 'getCanonicalOrder' | 'createOrder' | 'correctOrder'
  >;
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
      const page = value(
        await input.orders.listCanonicalOrders({
          businessId: controlAccess(response).business.id,
          locationIds: controlLocationIds(response, query.locationId),
          query: query.query ?? null,
          state: query.state ?? null,
          limit: query.limit,
          cursor: query.cursor ?? null,
        }),
      );
      response.json(
        apiSuccess(
          controlOrderListSchema.parse({
            items: page.items.map(controlOrder),
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
      const order = value(
        await input.orders.getCanonicalOrder({
          businessId: controlAccess(response).business.id,
          locationIds: controlLocationIds(response),
          orderId: request.params['orderId'] as string,
        }),
      );
      response.json(
        apiSuccess(controlOrderDetailSchema.parse(controlOrderDetail(order))),
      );
    }),
  );

  routes.post(
    '/orders',
    ...write,
    validateRequest({ body: controlCreateOrderRequestSchema }),
    catchAsync(async (request, response) => {
      controlLocationIds(response, request.body.fulfillment.locationId);
      const outcome = value(
        await input.orders.createOrder({
          ...request.body,
          businessId: controlAccess(response).business.id,
          context: controlCommandContext(response),
          customer: directCustomer(request.body.customer),
          dueAt: new Date(request.body.dueAt),
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
      const current = value(
        await input.orders.getCanonicalOrder({
          businessId: controlAccess(response).business.id,
          locationIds: controlLocationIds(response),
          orderId,
        }),
      );
      const body = request.body;
      const outcome = value(
        await input.orders.correctOrder({
          businessId: controlAccess(response).business.id,
          idempotencyKey: body.idempotencyKey,
          context: controlCommandContext(response),
          reasonCode: body.reasonCode,
          reasonNote: body.reasonNote,
          expectedOrderVersion: body.expectedOrderVersion,
          expectedFulfillmentVersion: body.expectedFulfillmentVersion,
          locationId: current.fulfillment.locationId,
          orderId,
          changes: {
            ...body.changes,
            ...(body.changes.customer === undefined
              ? {}
              : { customer: directCustomer(body.changes.customer) }),
            ...(body.changes.dueAt === undefined
              ? {}
              : { dueAt: new Date(body.changes.dueAt) }),
          },
        }),
      );
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome)));
    }),
  );

  return routes;
};

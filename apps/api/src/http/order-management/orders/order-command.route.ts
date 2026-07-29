import {
  canonicalOrderParamsSchema,
  correctOrderRequestSchema,
  createOrderRequestSchema,
  orderMutationResultSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrderCustomer, OrdersApplication } from '@pressly/orders';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.mapper.ts';

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

export const makeOrderCommandRoutes = (input: {
  orders: Pick<OrdersApplication, 'createOrder' | 'correctOrder'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();
  const locationSecurity = [
    input.authenticate,
    validateRequest({ params: productionLocationParamsSchema }),
    input.authorize,
  ] as const;

  routes.post(
    '/order-management/locations/:locationId/orders',
    ...locationSecurity,
    validateRequest({ body: createOrderRequestSchema }),
    catchAsync(async (request, response) => {
      if (request.body.fulfillment.locationId !== request.params['locationId'])
        throw makeAppError({
          kind: 'ValidationError',
          code: 'order_location_mismatch',
          message: 'The Order fulfillment location does not match the route.',
          safeMessage: 'The order location does not match this location.',
          status: 422,
        });
      const outcome = await input.orders.createOrder({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        customer: directCustomer(request.body.customer),
        dueAt: new Date(request.body.dueAt),
      });
      if (outcome.tag === 'err') throw outcome.error;
      response
        .status(201)
        .json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );
  routes.patch(
    '/order-management/locations/:locationId/orders/:orderId',
    input.authenticate,
    validateRequest({ params: canonicalOrderParamsSchema }),
    input.authorize,
    validateRequest({ body: correctOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const outcome = await input.orders.correctOrder({
        idempotencyKey: body.idempotencyKey,
        context: orderManagementCommandContext(response, input.readPrincipal),
        reasonCode: body.reasonCode,
        reasonNote: body.reasonNote,
        expectedOrderVersion: body.expectedOrderVersion,
        expectedFulfillmentVersion: body.expectedFulfillmentVersion,
        locationId: request.params['locationId'] as string,
        orderId: request.params['orderId'] as string,
        changes: {
          ...body.changes,
          ...(body.changes.customer === undefined
            ? {}
            : { customer: directCustomer(body.changes.customer) }),
          ...(body.changes.dueAt === undefined
            ? {}
            : { dueAt: new Date(body.changes.dueAt) }),
        },
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );

  return routes;
};

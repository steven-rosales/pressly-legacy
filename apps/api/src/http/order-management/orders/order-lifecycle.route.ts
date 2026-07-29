import {
  cancelOrderRequestSchema,
  canonicalOrderParamsSchema,
  completeOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrdersApplication } from '@pressly/orders';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.mapper.ts';

export const makeOrderLifecycleRoutes = (input: {
  orders: Pick<OrdersApplication, 'completeOrder' | 'cancelOrder'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();
  const security = [
    input.authenticate,
    validateRequest({ params: canonicalOrderParamsSchema }),
    input.authorize,
  ] as const;

  routes.post(
    '/order-management/locations/:locationId/orders/:orderId/complete',
    ...security,
    validateRequest({ body: completeOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.completeOrder({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: request.params['locationId'] as string,
        orderId: request.params['orderId'] as string,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/orders/:orderId/cancel',
    ...security,
    validateRequest({ body: cancelOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.cancelOrder({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: request.params['locationId'] as string,
        orderId: request.params['orderId'] as string,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );

  return routes;
};

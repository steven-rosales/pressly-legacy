import {
  cancelOrderRequestSchema,
  canonicalOrderParamsSchema,
  completeOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrdersApplication } from '@pressly/orders';
import type { LocationAncestryPort } from '@pressly/authorization';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.adapter.ts';
import { orderManagementResultValue } from './order-management.error.ts';

export const makeOrderLifecycleRoutes = (input: {
  orders: Pick<OrdersApplication, 'completeOrder' | 'cancelOrder'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
  resolveBusinessId: LocationAncestryPort['resolveBusinessId'];
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
        businessId: await input.resolveBusinessId(
          request.params['locationId'] as string,
        ),
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: request.params['locationId'] as string,
        orderId: request.params['orderId'] as string,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/orders/:orderId/cancel',
    ...security,
    validateRequest({ body: cancelOrderRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.cancelOrder({
        ...request.body,
        businessId: await input.resolveBusinessId(
          request.params['locationId'] as string,
        ),
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: request.params['locationId'] as string,
        orderId: request.params['orderId'] as string,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    }),
  );

  return routes;
};

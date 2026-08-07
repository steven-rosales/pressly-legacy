import {
  cancelOrderRequestSchema,
  canonicalOrderParamsSchema,
  completeOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
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
  const completeController = defineValidatedController({
    request: {
      params: canonicalOrderParamsSchema,
      body: completeOrderRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.completeOrder({
        ...body,
        businessId: await input.resolveBusinessId(params.locationId),
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: params.locationId,
        orderId: params.orderId,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });
  const cancelController = defineValidatedController({
    request: {
      params: canonicalOrderParamsSchema,
      body: cancelOrderRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.cancelOrder({
        ...body,
        businessId: await input.resolveBusinessId(params.locationId),
        context: orderManagementCommandContext(response, input.readPrincipal),
        locationId: params.locationId,
        orderId: params.orderId,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });

  routes.post(
    '/order-management/locations/:locationId/orders/:orderId/complete',
    input.authenticate,
    completeController.validators.params,
    input.authorize,
    completeController.validators.body,
    completeController.handle,
  );

  routes.post(
    '/order-management/locations/:locationId/orders/:orderId/cancel',
    input.authenticate,
    cancelController.validators.params,
    input.authorize,
    cancelController.validators.body,
    cancelController.handle,
  );

  return routes;
};

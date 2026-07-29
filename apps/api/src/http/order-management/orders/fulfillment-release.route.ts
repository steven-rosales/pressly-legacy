import {
  canonicalFulfillmentParamsSchema,
  orderMutationResultSchema,
  releaseFulfillmentRequestSchema,
  withdrawFulfillmentRequestSchema,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrdersApplication } from '@pressly/orders';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.mapper.ts';

export const makeFulfillmentReleaseRoutes = (input: {
  orders: Pick<OrdersApplication, 'releaseFulfillment' | 'withdrawFulfillment'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();

  const security = [
    input.authenticate,
    validateRequest({ params: canonicalFulfillmentParamsSchema }),
    input.authorize,
  ] as const;

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
    ...security,
    validateRequest({ body: releaseFulfillmentRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.releaseFulfillment({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: request.params['fulfillmentId'] as string,
        locationId: request.params['locationId'] as string,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
    ...security,
    validateRequest({ body: withdrawFulfillmentRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.withdrawFulfillment({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: request.params['fulfillmentId'] as string,
        locationId: request.params['locationId'] as string,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome.value)));
    }),
  );

  return routes;
};

import {
  canonicalFulfillmentParamsSchema,
  changeFulfillmentReleaseRequestSchema,
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

export const makeFulfillmentReleaseRoutes = (input: {
  orders: Pick<OrdersApplication, 'changeFulfillmentRelease'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();

  routes.put(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
    input.authenticate,
    validateRequest({ params: canonicalFulfillmentParamsSchema }),
    input.authorize,
    validateRequest({ body: changeFulfillmentReleaseRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.changeFulfillmentRelease({
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

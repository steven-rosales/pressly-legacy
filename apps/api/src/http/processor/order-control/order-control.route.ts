import {
  listProcessorOrderControlResultSchema,
  listProductionOrderControlQuerySchema,
  productionLocationParamsSchema,
  type ListProductionOrderControlQuery,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { ProductionApplication } from '@pressly/production';
import { Router, type RequestHandler } from 'express';
import type { ProcessorOrderControlReadModel } from './order-control.query.ts';

export const makeProcessorOrderControlRoutes = (input: {
  production: Pick<ProductionApplication, 'listProductionOrderControl'>;
  readModel: ProcessorOrderControlReadModel;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const routes = Router();
  routes.get(
    '/production/locations/:locationId/order-control',
    input.authenticate,
    validateRequest({
      params: productionLocationParamsSchema,
      query: listProductionOrderControlQuerySchema,
    }),
    input.authorize,
    catchAsync(async (request, response) => {
      const result = await input.production.listProductionOrderControl({
        ...(request.query as unknown as ListProductionOrderControlQuery),
        locationId: request.params['locationId'] as string,
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          listProcessorOrderControlResultSchema.parse(
            await input.readModel.compose(result.value),
          ),
        ),
      );
    }),
  );
  return routes;
};

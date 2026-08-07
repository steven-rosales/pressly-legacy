import { listProcessorOrderControlResultSchema } from '@pressly/contracts/processor';
import {
  listProductionOrderControlQuerySchema,
  productionLocationParamsSchema,
  type ListProductionOrderControlQuery,
} from '@pressly/contracts/production';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import type { ProductionApplication } from '@pressly/production';
import { Router, type RequestHandler } from 'express';
import type { ProcessorOrderControlAdapter } from './order-control.adapter.ts';

type ListProductionOrderControlCommand = Parameters<
  ProductionApplication['listProductionOrderControl']
>[0];

const toListProductionOrderControlCommand = (
  locationId: string,
  query: ListProductionOrderControlQuery,
): ListProductionOrderControlCommand => ({
  locationId,
  view: query.view,
  ...(query.search === undefined ? {} : { search: query.search }),
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.dueBucket === undefined ? {} : { dueBucket: query.dueBucket }),
  ...(query.productionRunId === undefined
    ? {}
    : { productionRunId: query.productionRunId }),
  ...(query.productionBatchId === undefined
    ? {}
    : { productionBatchId: query.productionBatchId }),
  ...(query.stage === undefined ? {} : { stage: query.stage }),
  ...(query.priority === undefined ? {} : { priority: query.priority }),
  ...(query.movable === undefined ? {} : { movable: query.movable }),
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  limit: query.limit,
});

export const makeProcessorOrderControlRoutes = (input: {
  production: Pick<ProductionApplication, 'listProductionOrderControl'>;
  orderControlAdapter: ProcessorOrderControlAdapter;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const routes = Router();
  const controller = defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      query: listProductionOrderControlQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
      const result = await input.production.listProductionOrderControl(
        toListProductionOrderControlCommand(params.locationId, query),
      );
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          listProcessorOrderControlResultSchema.parse(
            await input.orderControlAdapter.compose(result.value),
          ),
        ),
      );
    },
  });
  routes.get(
    '/production/locations/:locationId/order-control',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return routes;
};

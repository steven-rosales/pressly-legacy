import {
  processorListProductionHistoryActivityResultSchema,
  processorProductionOrderBacklogPreviewSchema,
  processorProductionBoardSchema,
  processorProductionHistoryRunDetailSchema,
  processorProductionWorkspaceSchema,
  processorRemainingDayForecastSchema,
} from '@pressly/contracts/processor';
import {
  listProductionHistoryActivityQuerySchema,
  previewProductionOrderBacklogRequestSchema,
  productionHistoryLocationParamsSchema,
  productionHistoryRunParamsSchema,
  productionLocationParamsSchema,
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionRunBoardParamsSchema,
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
} from '@pressly/contracts/production';
import { apiSuccess } from '@pressly/http';
import { defineRequestBoundary } from '@pressly/http/express';
import type {
  ProductionApplication,
  ProductionHttpApplication,
} from '@pressly/production';
import { Router, type RequestHandler } from 'express';
import type { ProcessorOperationalOrderIdentityAdapter } from './operational-order-identity.adapter.ts';

type ProcessorProductionReadApplication = Readonly<{
  loadProductionWorkspace: ProductionApplication['loadProductionWorkspace'];
  loadProductionBoard: ProductionApplication['loadProductionBoard'];
  previewProductionOrderBacklog: ProductionApplication['previewProductionOrderBacklog'];
  loadRemainingDayForecast: ProductionHttpApplication['loadRemainingDayForecast'];
  productionHistory: Pick<
    ProductionApplication['productionHistory'],
    'listActivity' | 'loadRun'
  >;
}>;

const previewProductionOrderBacklogBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  body: previewProductionOrderBacklogRequestSchema,
});

const productionBoardBoundary = defineRequestBoundary({
  params: productionRunBoardParamsSchema,
});

const productionWorkspaceBoundary = defineRequestBoundary({
  params: productionWorkspaceParamsSchema,
  query: productionWorkspaceQuerySchema,
});

const remainingDayForecastBoundary = defineRequestBoundary({
  params: productionRemainingDayForecastParamsSchema,
  query: productionRemainingDayForecastQuerySchema,
});

const productionHistoryActivityBoundary = defineRequestBoundary({
  params: productionHistoryLocationParamsSchema,
  query: listProductionHistoryActivityQuerySchema,
});

const productionHistoryRunBoundary = defineRequestBoundary({
  params: productionHistoryRunParamsSchema,
});

export const makeProcessorOperationalOrderRoutes = (input: {
  production: ProcessorProductionReadApplication;
  operationalOrderAdapter: ProcessorOperationalOrderIdentityAdapter;
  authenticate: RequestHandler;
  authorizeRead: RequestHandler;
  authorizeOverride: RequestHandler;
}): Router => {
  const routes = Router();

  routes.get(
    '/production/locations/:locationId/runs/:productionRunId/board',
    input.authenticate,
    productionBoardBoundary.validate,
    input.authorizeRead,
    productionBoardBoundary.handler(async ({ params }, { response }) => {
      const result = await input.production.loadProductionBoard({
        locationId: params.locationId,
        productionRunId: params.productionRunId,
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          processorProductionBoardSchema.parse(
            await input.operationalOrderAdapter.composeBoard(result.value),
          ),
        ),
      );
    }),
  );

  routes.post(
    '/production/locations/:locationId/order-backlog/preview',
    input.authenticate,
    previewProductionOrderBacklogBoundary.validate,
    input.authorizeOverride,
    previewProductionOrderBacklogBoundary.handler(
      async ({ body, params }, { response }) => {
        const preview = await input.production.previewProductionOrderBacklog({
          locationId: params.locationId,
          filter: body.filter,
          cutoff: body.cutoff,
          reason: body.reason,
          cursor: body.cursor,
          maxOrders: body.maxOrders,
        });
        if (preview.tag === 'err') throw preview.error;
        response.json(
          apiSuccess(
            processorProductionOrderBacklogPreviewSchema.parse(
              await input.operationalOrderAdapter.composeBacklogPreview(
                preview.value,
              ),
            ),
          ),
        );
      },
    ),
  );

  routes.get(
    '/production/locations/:locationId/workspace',
    input.authenticate,
    productionWorkspaceBoundary.validate,
    input.authorizeRead,
    productionWorkspaceBoundary.handler(
      async ({ params, query }, { response }) => {
        const result = await input.production.loadProductionWorkspace({
          locationId: params.locationId,
          ...(query.shiftId === undefined ? {} : { shiftId: query.shiftId }),
        });
        if (result.tag === 'err') throw result.error;
        response.json(
          apiSuccess(
            processorProductionWorkspaceSchema.parse(
              await input.operationalOrderAdapter.composeWorkspace(
                result.value,
              ),
            ),
          ),
        );
      },
    ),
  );

  routes.get(
    '/production/locations/:locationId/forecast',
    input.authenticate,
    remainingDayForecastBoundary.validate,
    input.authorizeRead,
    remainingDayForecastBoundary.handler(
      async ({ params, query }, { response }) => {
        const result = await input.production.loadRemainingDayForecast({
          locationId: params.locationId,
          serviceDay: query.serviceDay,
        });
        if (result.tag === 'err') throw result.error;
        response.json(
          apiSuccess(
            processorRemainingDayForecastSchema.parse(
              await input.operationalOrderAdapter.composeForecast(result.value),
            ),
          ),
        );
      },
    ),
  );

  routes.get(
    '/production/locations/:locationId/history/activity',
    input.authenticate,
    productionHistoryActivityBoundary.validate,
    input.authorizeRead,
    productionHistoryActivityBoundary.handler(
      async ({ params, query }, { response }) => {
        const activity = await input.production.productionHistory.listActivity({
          locationId: params.locationId,
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.runId === undefined ? {} : { runId: query.runId }),
          ...(query.entityType === undefined
            ? {}
            : { entityType: query.entityType }),
          ...(query.eventType === undefined
            ? {}
            : { eventType: query.eventType }),
          ...(query.orderResolution === undefined
            ? {}
            : { orderResolution: query.orderResolution }),
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.occurredAfter === undefined
            ? {}
            : { occurredAfter: new Date(query.occurredAfter) }),
        });
        if (activity.tag === 'err') throw activity.error;
        response.json(
          apiSuccess(
            processorListProductionHistoryActivityResultSchema.parse(
              await input.operationalOrderAdapter.composeHistoryActivity(
                activity.value,
              ),
            ),
          ),
        );
      },
    ),
  );

  routes.get(
    '/production/locations/:locationId/history/runs/:productionRunId',
    input.authenticate,
    productionHistoryRunBoundary.validate,
    input.authorizeRead,
    productionHistoryRunBoundary.handler(async ({ params }, { response }) => {
      const result = await input.production.productionHistory.loadRun({
        locationId: params.locationId,
        productionRunId: params.productionRunId,
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          processorProductionHistoryRunDetailSchema.parse(
            await input.operationalOrderAdapter.composeHistoryRun(result.value),
          ),
        ),
      );
    }),
  );

  return routes;
};

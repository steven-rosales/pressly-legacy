import {
  listProductionHistoryActivityQuerySchema,
  previewProductionOrderBacklogRequestSchema,
  processorListProductionHistoryActivityResultSchema,
  processorProductionOrderBacklogPreviewSchema,
  processorProductionHistoryRunDetailSchema,
  processorProductionWorkspaceSchema,
  processorRemainingDayForecastSchema,
  productionHistoryLocationParamsSchema,
  productionHistoryRunParamsSchema,
  productionLocationParamsSchema,
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
  type ListProductionHistoryActivityQuery,
  type PreviewProductionOrderBacklogCommand,
  type ProductionRemainingDayForecast,
} from '@pressly/contracts';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { ProductionApplication } from '@pressly/production';
import { Router, type RequestHandler } from 'express';
import type { ProcessorOperationalOrderReadModel } from './operational-order-identity.read-model.ts';

type ProcessorProductionReadApplication = Readonly<{
  loadProductionWorkspace: ProductionApplication['loadProductionWorkspace'];
  previewProductionOrderBacklog: ProductionApplication['previewProductionOrderBacklog'];
  loadRemainingDayForecast: (query: {
    locationId: string;
    serviceDay: string;
  }) => Promise<
    | Readonly<{ tag: 'ok'; value: ProductionRemainingDayForecast }>
    | Readonly<{ tag: 'err'; error: unknown }>
  >;
  productionHistory: Pick<
    ProductionApplication['productionHistory'],
    'listActivity' | 'loadRun'
  >;
}>;

export const makeProcessorOperationalOrderRoutes = (input: {
  production: ProcessorProductionReadApplication;
  readModel: ProcessorOperationalOrderReadModel;
  authenticate: RequestHandler;
  authorizeRead: RequestHandler;
  authorizeOverride: RequestHandler;
}): Router => {
  const routes = Router();

  routes.post(
    '/production/locations/:locationId/order-backlog/preview',
    input.authenticate,
    validateRequest({
      params: productionLocationParamsSchema,
      body: previewProductionOrderBacklogRequestSchema,
    }),
    input.authorizeOverride,
    catchAsync(async (request, response) => {
      const body = request.body as Omit<
        PreviewProductionOrderBacklogCommand,
        'locationId'
      >;
      const preview = await input.production.previewProductionOrderBacklog({
        ...body,
        locationId: request.params['locationId'] as string,
      });
      if (preview.tag === 'err') {
        response.status(preview.error.status).json(apiFailure(preview.error));
        return;
      }
      response.json(
        apiSuccess(
          processorProductionOrderBacklogPreviewSchema.parse(
            await input.readModel.composeBacklogPreview(preview.value),
          ),
        ),
      );
    }),
  );

  routes.get(
    '/production/locations/:locationId/workspace',
    input.authenticate,
    validateRequest({
      params: productionWorkspaceParamsSchema,
      query: productionWorkspaceQuerySchema,
    }),
    input.authorizeRead,
    catchAsync(async (request, response) => {
      const result = await input.production.loadProductionWorkspace({
        locationId: request.params['locationId'] as string,
        ...(typeof request.query['shiftId'] === 'string'
          ? { shiftId: request.query['shiftId'] }
          : {}),
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          processorProductionWorkspaceSchema.parse(
            await input.readModel.composeWorkspace(result.value),
          ),
        ),
      );
    }),
  );

  routes.get(
    '/production/locations/:locationId/forecast',
    input.authenticate,
    validateRequest({
      params: productionRemainingDayForecastParamsSchema,
      query: productionRemainingDayForecastQuerySchema,
    }),
    input.authorizeRead,
    catchAsync(async (request, response) => {
      const result = await input.production.loadRemainingDayForecast({
        locationId: request.params['locationId'] as string,
        serviceDay: request.query['serviceDay'] as string,
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          processorRemainingDayForecastSchema.parse(
            await input.readModel.composeForecast(result.value),
          ),
        ),
      );
    }),
  );

  routes.get(
    '/production/locations/:locationId/history/activity',
    input.authenticate,
    validateRequest({
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryActivityQuerySchema,
    }),
    input.authorizeRead,
    catchAsync(async (request, response) => {
      const activity = await input.production.productionHistory.listActivity({
        ...(request.query as unknown as ListProductionHistoryActivityQuery),
        locationId: request.params['locationId'] as string,
      });
      if (activity.tag === 'err') {
        response.status(activity.error.status).json(apiFailure(activity.error));
        return;
      }
      response.json(
        apiSuccess(
          processorListProductionHistoryActivityResultSchema.parse(
            await input.readModel.composeHistoryActivity(activity.value),
          ),
        ),
      );
    }),
  );

  routes.get(
    '/production/locations/:locationId/history/runs/:productionRunId',
    input.authenticate,
    validateRequest({ params: productionHistoryRunParamsSchema }),
    input.authorizeRead,
    catchAsync(async (request, response) => {
      const result = await input.production.productionHistory.loadRun({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
      });
      if (result.tag === 'err') throw result.error;
      response.json(
        apiSuccess(
          processorProductionHistoryRunDetailSchema.parse(
            await input.readModel.composeHistoryRun(result.value),
          ),
        ),
      );
    }),
  );

  return routes;
};

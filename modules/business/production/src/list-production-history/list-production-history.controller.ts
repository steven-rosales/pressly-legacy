import type {
  ListProductionHistoryActivityQuery,
  ListProductionHistoryPlansQuery,
  ListProductionHistoryRunsQuery,
} from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { ProductionHistoryApplication } from './list-production-history.port.ts';

export const makeListProductionHistoryRunsController = (
  history: ProductionHistoryApplication,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await history.listRuns({
        ...(request.query as unknown as ListProductionHistoryRunsQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

export const makeListProductionHistoryActivityController = (
  history: ProductionHistoryApplication,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await history.listActivity({
        ...(request.query as unknown as ListProductionHistoryActivityQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

export const makeListProductionHistoryPlansController = (
  history: ProductionHistoryApplication,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await history.listPlans({
        ...(request.query as unknown as ListProductionHistoryPlansQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

export const makeLoadProductionHistoryRunController = (
  history: ProductionHistoryApplication,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await history.loadRun({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
      }),
    );
  });

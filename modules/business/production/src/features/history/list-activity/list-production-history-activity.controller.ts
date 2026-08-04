import {
  listProductionHistoryActivityQuerySchema,
  listProductionHistoryActivityResultSchema,
  productionHistoryLocationParamsSchema,
} from './list-production-history-activity.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toListProductionHistoryActivityResult } from './list-production-history-activity.contract.mapper.ts';
import type { ListProductionHistoryActivity } from './list-production-history-activity.port.ts';

export const listProductionHistoryActivityBoundary = defineRequestBoundary({
  params: productionHistoryLocationParamsSchema,
  query: listProductionHistoryActivityQuerySchema,
});

export const makeListProductionHistoryActivityController = (input: {
  listActivity: ListProductionHistoryActivity;
}): RequestHandler =>
  listProductionHistoryActivityBoundary.handler(
    async ({ params, query }, { response }) => {
      const {
        cursor,
        limit,
        runId,
        entityType,
        eventType,
        orderResolution,
        search,
        occurredAfter,
      } = query;
      sendValidatedProductionResult(
        response,
        await input.listActivity({
          locationId: params.locationId,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          ...(runId === undefined ? {} : { runId }),
          ...(entityType === undefined ? {} : { entityType }),
          ...(eventType === undefined ? {} : { eventType }),
          ...(orderResolution === undefined ? {} : { orderResolution }),
          ...(search === undefined ? {} : { search }),
          ...(occurredAfter === undefined
            ? {}
            : { occurredAfter: new Date(occurredAfter) }),
        }),
        {
          schema: listProductionHistoryActivityResultSchema,
          present: toListProductionHistoryActivityResult,
        },
      );
    },
  );

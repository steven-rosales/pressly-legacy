import {
  listProductionHistoryActivityQuerySchema,
  listProductionHistoryActivityResultSchema,
  productionHistoryLocationParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toListProductionHistoryActivityResult } from './list-production-history-activity.contract.mapper.ts';
import type { ListProductionHistoryActivity } from './list-production-history-activity.port.ts';

export const makeListProductionHistoryActivityController = (input: {
  listActivity: ListProductionHistoryActivity;
}) =>
  defineValidatedController({
    request: {
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryActivityQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
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
  });

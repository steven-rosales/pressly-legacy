import {
  listProductionHistoryRunsQuerySchema,
  listProductionHistoryRunsResultSchema,
  productionHistoryLocationParamsSchema,
} from './list-production-history-runs.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toListProductionHistoryRunsResult } from './list-production-history-runs.contract.mapper.ts';
import type { ListProductionHistoryRuns } from './list-production-history-runs.port.ts';

export const listProductionHistoryRunsBoundary = defineRequestBoundary({
  params: productionHistoryLocationParamsSchema,
  query: listProductionHistoryRunsQuerySchema,
});

export const makeListProductionHistoryRunsController = (input: {
  listRuns: ListProductionHistoryRuns;
}): RequestHandler =>
  listProductionHistoryRunsBoundary.handler(
    async ({ params, query }, { response }) => {
      const { cursor, search, status, createdAfter, limit } = query;
      sendValidatedProductionResult(
        response,
        await input.listRuns({
          locationId: params.locationId,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          ...(search === undefined ? {} : { search }),
          ...(status === undefined ? {} : { status }),
          ...(createdAfter === undefined
            ? {}
            : { createdAfter: new Date(createdAfter) }),
        }),
        {
          schema: listProductionHistoryRunsResultSchema,
          present: toListProductionHistoryRunsResult,
        },
      );
    },
  );

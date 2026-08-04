import {
  listProductionHistoryPlansQuerySchema,
  listProductionHistoryPlansResultSchema,
  productionHistoryLocationParamsSchema,
} from './list-production-history-plans.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toListProductionHistoryPlansResult } from './list-production-history-plans.contract.mapper.ts';
import type { ListProductionHistoryPlans } from './list-production-history-plans.port.ts';

export const listProductionHistoryPlansBoundary = defineRequestBoundary({
  params: productionHistoryLocationParamsSchema,
  query: listProductionHistoryPlansQuerySchema,
});

export const makeListProductionHistoryPlansController = (input: {
  listPlans: ListProductionHistoryPlans;
}): RequestHandler =>
  listProductionHistoryPlansBoundary.handler(
    async ({ params, query }, { response }) => {
      const { cursor, runId, search, status, createdAfter, limit } = query;
      sendValidatedProductionResult(
        response,
        await input.listPlans({
          locationId: params.locationId,
          limit,
          ...(cursor === undefined ? {} : { cursor }),
          ...(runId === undefined ? {} : { runId }),
          ...(search === undefined ? {} : { search }),
          ...(status === undefined ? {} : { status }),
          ...(createdAfter === undefined
            ? {}
            : { createdAfter: new Date(createdAfter) }),
        }),
        {
          schema: listProductionHistoryPlansResultSchema,
          present: toListProductionHistoryPlansResult,
        },
      );
    },
  );

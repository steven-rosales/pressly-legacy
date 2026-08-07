import {
  listProductionHistoryPlansQuerySchema,
  listProductionHistoryPlansResultSchema,
  productionHistoryLocationParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toListProductionHistoryPlansResult } from './list-production-history-plans.contract.mapper.ts';
import type { ListProductionHistoryPlans } from './list-production-history-plans.port.ts';

export const makeListProductionHistoryPlansController = (input: {
  listPlans: ListProductionHistoryPlans;
}) =>
  defineValidatedController({
    request: {
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryPlansQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
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
  });

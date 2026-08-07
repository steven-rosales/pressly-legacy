import {
  listProductionHistoryRunsQuerySchema,
  listProductionHistoryRunsResultSchema,
  productionHistoryLocationParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toListProductionHistoryRunsResult } from './list-production-history-runs.contract.mapper.ts';
import type { ListProductionHistoryRuns } from './list-production-history-runs.port.ts';

export const makeListProductionHistoryRunsController = (input: {
  listRuns: ListProductionHistoryRuns;
}) =>
  defineValidatedController({
    request: {
      params: productionHistoryLocationParamsSchema,
      query: listProductionHistoryRunsQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
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
  });

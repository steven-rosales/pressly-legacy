import {
  productionHistoryRunDetailSchema,
  productionHistoryRunParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toProductionHistoryRunDetailResult } from './load-production-history-run.contract.mapper.ts';
import type { LoadProductionHistoryRun } from './load-production-history-run.port.ts';

export const makeLoadProductionHistoryRunController = (input: {
  loadRun: LoadProductionHistoryRun;
}) =>
  defineValidatedController({
    request: { params: productionHistoryRunParamsSchema },
    handle: async ({ params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.loadRun({
          locationId: params.locationId,
          productionRunId: params.productionRunId,
        }),
        {
          schema: productionHistoryRunDetailSchema,
          present: toProductionHistoryRunDetailResult,
        },
      );
    },
  });

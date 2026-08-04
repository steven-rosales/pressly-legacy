import {
  productionHistoryRunDetailSchema,
  productionHistoryRunParamsSchema,
} from './load-production-history-run.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toProductionHistoryRunDetailResult } from './load-production-history-run.contract.mapper.ts';
import type { LoadProductionHistoryRun } from './load-production-history-run.port.ts';

export const loadProductionHistoryRunBoundary = defineRequestBoundary({
  params: productionHistoryRunParamsSchema,
});

export const makeLoadProductionHistoryRunController = (input: {
  loadRun: LoadProductionHistoryRun;
}): RequestHandler =>
  loadProductionHistoryRunBoundary.handler(async ({ params }, { response }) => {
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
  });

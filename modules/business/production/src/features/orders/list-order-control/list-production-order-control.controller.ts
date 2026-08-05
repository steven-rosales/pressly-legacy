import {
  listProductionOrderControlQuerySchema,
  listProductionOrderControlResultSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toListProductionOrderControlCommand,
  toListProductionOrderControlResult,
} from './list-production-order-control.contract.mapper.ts';
import type { ListProductionOrderControl } from './list-production-order-control.port.ts';

export const makeListProductionOrderControlController = (
  list: ListProductionOrderControl,
) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      query: listProductionOrderControlQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
      sendValidatedProductionResult(
        response,
        await list(
          toListProductionOrderControlCommand(params.locationId, query),
        ),
        {
          schema: listProductionOrderControlResultSchema,
          present: toListProductionOrderControlResult,
        },
      );
    },
  });

import {
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toListProductionOrdersCommand,
  toListProductionOrdersResult,
} from './list-production-orders.contract.mapper.ts';
import type { ListProductionOrders } from './list-production-orders.port.ts';

export const makeListProductionOrdersController = (
  listOrders: ListProductionOrders,
) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      query: listProductionOrdersQuerySchema,
    },
    handle: async ({ params, query }, context) => {
      const found = await listOrders(
        toListProductionOrdersCommand(params.locationId, query),
      );

      sendValidatedProductionResult(context.response, found, {
        schema: listProductionOrdersResultSchema,
        present: toListProductionOrdersResult,
      });
    },
  });

import {
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  productionLocationParamsSchema,
} from './list-production-orders.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toListProductionOrdersCommand,
  toListProductionOrdersResult,
} from './list-production-orders.contract.mapper.ts';
import type { ListProductionOrders } from './list-production-orders.port.ts';

export const listProductionOrdersBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  query: listProductionOrdersQuerySchema,
});

export const makeListProductionOrdersController = (
  listOrders: ListProductionOrders,
): RequestHandler =>
  listProductionOrdersBoundary.handler(async ({ params, query }, context) => {
    const found = await listOrders(
      toListProductionOrdersCommand(params.locationId, query),
    );

    sendValidatedProductionResult(context.response, found, {
      schema: listProductionOrdersResultSchema,
      present: toListProductionOrdersResult,
    });
  });

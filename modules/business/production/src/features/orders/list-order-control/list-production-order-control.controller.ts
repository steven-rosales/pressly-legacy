import {
  listProductionOrderControlQuerySchema,
  listProductionOrderControlResultSchema,
  productionLocationParamsSchema,
} from './list-production-order-control.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toListProductionOrderControlCommand,
  toListProductionOrderControlResult,
} from './list-production-order-control.contract.mapper.ts';
import type { ListProductionOrderControl } from './list-production-order-control.port.ts';

export const listProductionOrderControlBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  query: listProductionOrderControlQuerySchema,
});

export const makeListProductionOrderControlController = (
  list: ListProductionOrderControl,
): RequestHandler =>
  listProductionOrderControlBoundary.handler(
    async ({ params, query }, { response }) => {
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
  );

import type { ListProductionOrdersQuery } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendProductionResult } from '../http/production-response.ts';
import type { ListProductionOrders } from './list-production-orders.port.ts';

export const makeListProductionOrdersController = (
  listOrders: ListProductionOrders,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await listOrders({
        ...(request.query as unknown as ListProductionOrdersQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

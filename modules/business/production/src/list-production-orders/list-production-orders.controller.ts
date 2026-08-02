import type { ListProductionOrdersQuery } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { ListProductionOrders } from './list-production-orders.port.ts';

export const makeListProductionOrdersController = (
  listOrders: ListProductionOrders,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await listOrders({
        ...(request.query as unknown as ListProductionOrdersQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

import type { ListProductionOrderControlQuery } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { ListProductionOrderControl } from './list-production-order-control.port.ts';

export const makeListProductionOrderControlController = (
  list: ListProductionOrderControl,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await list({
        ...(request.query as unknown as ListProductionOrderControlQuery),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

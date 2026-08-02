import type { RequestHandler } from 'express';
import type { SetProductionOrderPriorityCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';

export const makeSetProductionOrderPriorityController = (input: {
  setPriority: SetProductionOrderPriority;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.setPriority({
        ...(request.body as Omit<
          SetProductionOrderPriorityCommand,
          'locationId' | 'productionOrderId'
        >),
        locationId: request.params['locationId'] as string,
        productionOrderId: request.params['productionOrderId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });

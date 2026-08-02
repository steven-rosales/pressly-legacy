import type { ReplaceProductionShiftSelectionCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { ReplaceShiftOrderSelection } from './replace-shift-order-selection.port.ts';

export const makeReplaceShiftOrderSelectionController = (input: {
  replace: ReplaceShiftOrderSelection;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.replace({
        ...(request.body as Omit<
          ReplaceProductionShiftSelectionCommand,
          'locationId' | 'productionShiftId'
        >),
        locationId: request.params['locationId'] as string,
        productionShiftId: request.params['productionShiftId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });

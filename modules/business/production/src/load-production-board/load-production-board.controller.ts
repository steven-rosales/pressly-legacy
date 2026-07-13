import type { RequestHandler } from 'express';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoardController = (
  loadBoard: LoadProductionBoard,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await loadBoard({
        locationId: request.params['locationId'] as string,
        productionShiftId: request.params['productionShiftId'] as string,
      }),
    );
  });

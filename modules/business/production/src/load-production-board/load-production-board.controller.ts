import type { RequestHandler } from 'express';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoardController = (
  loadBoard: LoadProductionBoard,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await loadBoard({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
      }),
    );
  });

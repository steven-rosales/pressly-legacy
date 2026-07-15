import { Router, type RequestHandler } from 'express';
import { productionRunBoardParamsSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { LoadProductionBoard } from './load-production-board.usecase.ts';
import { makeLoadProductionBoardController } from './load-production-board.controller.ts';

export const makeLoadProductionBoardRoute = (input: {
  loadBoard: LoadProductionBoard;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/runs/:productionRunId/board',
    input.authenticate,
    validateRequest({ params: productionRunBoardParamsSchema }),
    input.authorize,
    makeLoadProductionBoardController(input.loadBoard),
  );
  return router;
};

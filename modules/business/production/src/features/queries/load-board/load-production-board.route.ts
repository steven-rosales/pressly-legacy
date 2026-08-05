import { Router, type RequestHandler } from 'express';
import type { LoadProductionBoard } from './load-production-board.port.ts';
import { makeLoadProductionBoardController } from './load-production-board.controller.ts';

export const makeLoadProductionBoardRoute = (input: {
  loadBoard: LoadProductionBoard;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeLoadProductionBoardController(input.loadBoard);
  router.get(
    '/production/locations/:locationId/runs/:productionRunId/board',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};

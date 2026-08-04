import { Router, type RequestHandler } from 'express';
import type { LoadProductionBoard } from './load-production-board.usecase.ts';
import {
  loadProductionBoardBoundary,
  makeLoadProductionBoardController,
} from './load-production-board.controller.ts';

export const makeLoadProductionBoardRoute = (input: {
  loadBoard: LoadProductionBoard;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/runs/:productionRunId/board',
    input.authenticate,
    loadProductionBoardBoundary.validate,
    input.authorize,
    makeLoadProductionBoardController(input.loadBoard),
  );
  return router;
};

import { Router, type RequestHandler } from 'express';
import {
  makeReplaceShiftOrderSelectionController,
  replaceShiftOrderSelectionBoundary,
} from './replace-shift-order-selection.controller.ts';
import type { ReplaceShiftOrderSelection } from './replace-shift-order-selection.usecase.ts';

export const makeReplaceShiftOrderSelectionRoute = (input: {
  replace: ReplaceShiftOrderSelection;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.put(
    '/production/locations/:locationId/shifts/:productionShiftId/selection',
    input.authenticate,
    replaceShiftOrderSelectionBoundary.validate,
    input.authorize,
    makeReplaceShiftOrderSelectionController(input),
  );
  return router;
};

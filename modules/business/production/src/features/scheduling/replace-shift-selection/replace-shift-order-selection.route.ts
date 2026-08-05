import { Router, type RequestHandler } from 'express';
import { makeReplaceShiftOrderSelectionController } from './replace-shift-order-selection.controller.ts';
import type { ReplaceShiftOrderSelection } from './replace-shift-order-selection.port.ts';

export const makeReplaceShiftOrderSelectionRoute = (input: {
  replace: ReplaceShiftOrderSelection;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeReplaceShiftOrderSelectionController(input);
  router.put(
    '/production/locations/:locationId/shifts/:productionShiftId/selection',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};

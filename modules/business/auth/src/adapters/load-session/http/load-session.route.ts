import { Router } from 'express';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { makeLoadSessionController } from './load-session.controller.ts';

export const makeLoadSessionRouter = (input: {
  loadSession: LoadSession;
}): Router => {
  const router = Router();
  const loadSessionController = makeLoadSessionController(input.loadSession);

  router.get('/', loadSessionController);

  return router;
};

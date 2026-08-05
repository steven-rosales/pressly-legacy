import { Router, type RequestHandler } from 'express';
import { makeLoadProductionWorkspaceController } from './load-production-workspace.controller.ts';
import type { LoadProductionWorkspace } from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspaceRoute = (input: {
  loadWorkspace: LoadProductionWorkspace;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeLoadProductionWorkspaceController(input.loadWorkspace);
  router.get(
    '/production/locations/:locationId/workspace',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};

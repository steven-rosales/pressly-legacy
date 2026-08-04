import { Router, type RequestHandler } from 'express';
import {
  loadProductionWorkspaceBoundary,
  makeLoadProductionWorkspaceController,
} from './load-production-workspace.controller.ts';
import type { LoadProductionWorkspace } from './load-production-workspace.usecase.ts';

export const makeLoadProductionWorkspaceRoute = (input: {
  loadWorkspace: LoadProductionWorkspace;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/workspace',
    input.authenticate,
    loadProductionWorkspaceBoundary.validate,
    input.authorize,
    makeLoadProductionWorkspaceController(input.loadWorkspace),
  );
  return router;
};

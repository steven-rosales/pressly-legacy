import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeLoadProductionWorkspaceController } from './load-production-workspace.controller.ts';
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
    validateRequest({
      params: productionWorkspaceParamsSchema,
      query: productionWorkspaceQuerySchema,
    }),
    input.authorize,
    makeLoadProductionWorkspaceController(input.loadWorkspace),
  );
  return router;
};

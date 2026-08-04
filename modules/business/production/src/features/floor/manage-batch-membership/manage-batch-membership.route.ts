import { Router, type RequestHandler } from 'express';
import {
  batchMembershipBoundaries,
  makeManageBatchMembershipController,
} from './manage-batch-membership.controller.ts';
import type { ManageBatchMembership } from './manage-batch-membership.usecase.ts';

export const makeManageBatchMembershipRoute = (input: {
  manage: ManageBatchMembership;
  authenticate: RequestHandler;
  authorizeFreeze: RequestHandler;
  authorizeUnfreeze: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();

  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
    input.authenticate,
    batchMembershipBoundaries.freeze.validate,
    input.authorizeFreeze,
    makeManageBatchMembershipController({
      ...input,
      action: 'freeze',
      authorizedAction: 'production:queue',
    }),
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    input.authenticate,
    batchMembershipBoundaries.unfreeze.validate,
    input.authorizeUnfreeze,
    makeManageBatchMembershipController({
      ...input,
      action: 'unfreeze',
      authorizedAction: 'production:override',
    }),
  );

  return router;
};

import { Router, type RequestHandler } from 'express';
import { makeManageBatchMembershipController } from './manage-batch-membership.controller.ts';
import type { ManageBatchMembership } from './manage-batch-membership.port.ts';

export const makeManageBatchMembershipRoute = (input: {
  manage: ManageBatchMembership;
  authenticate: RequestHandler;
  authorizeFreeze: RequestHandler;
  authorizeUnfreeze: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const freezeController = makeManageBatchMembershipController({
    ...input,
    action: 'freeze',
    authorizedAction: 'production:queue',
  });
  const unfreezeController = makeManageBatchMembershipController({
    ...input,
    action: 'unfreeze',
    authorizedAction: 'production:override',
  });

  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
    input.authenticate,
    freezeController.validate,
    input.authorizeFreeze,
    freezeController.handle,
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    input.authenticate,
    unfreezeController.validate,
    input.authorizeUnfreeze,
    unfreezeController.handle,
  );

  return router;
};

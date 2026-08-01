import {
  freezeProductionBatchRequestSchema,
  productionIdSchema,
  productionRunParamsSchema,
  unfreezeProductionBatchRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeManageBatchMembershipController } from './manage-batch-membership.controller.ts';
import type { ManageBatchMembership } from './manage-batch-membership.usecase.ts';

const productionBatchParamsSchema = productionRunParamsSchema
  .extend({ productionBatchId: productionIdSchema })
  .strict();

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
    validateRequest({
      params: productionBatchParamsSchema,
      body: freezeProductionBatchRequestSchema,
    }),
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
    validateRequest({
      params: productionBatchParamsSchema,
      body: unfreezeProductionBatchRequestSchema,
    }),
    input.authorizeUnfreeze,
    makeManageBatchMembershipController({
      ...input,
      action: 'unfreeze',
      authorizedAction: 'production:override',
    }),
  );

  return router;
};

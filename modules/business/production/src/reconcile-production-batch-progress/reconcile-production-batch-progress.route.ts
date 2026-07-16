import { Router, type RequestHandler } from 'express';
import {
  productionBatchProgressReconciliationParamsSchema,
  reconcileProductionBatchProgressRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.usecase.ts';
import { makeReconcileProductionBatchProgressController } from './reconcile-production-batch-progress.controller.ts';

export const makeReconcileProductionBatchProgressRoute = (input: {
  reconcile: ReconcileProductionBatchProgress;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
    input.authenticate,
    validateRequest({
      params: productionBatchProgressReconciliationParamsSchema,
      body: reconcileProductionBatchProgressRequestSchema,
    }),
    input.authorize,
    makeReconcileProductionBatchProgressController(input),
  );
  return router;
};

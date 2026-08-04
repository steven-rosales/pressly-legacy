import { Router, type RequestHandler } from 'express';
import {
  makeReconcileProductionBatchProgressController,
  reconcileProductionBatchProgressBoundary,
} from './reconcile-production-batch-progress.controller.ts';
import type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.usecase.ts';

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
    reconcileProductionBatchProgressBoundary.validate,
    input.authorize,
    makeReconcileProductionBatchProgressController(input),
  );
  return router;
};

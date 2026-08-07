import { Router, type RequestHandler } from 'express';
import { makeReconcileProductionBatchProgressController } from './reconcile-production-batch-progress.controller.ts';
import type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.port.ts';

export const makeReconcileProductionBatchProgressRoute = (input: {
  reconcile: ReconcileProductionBatchProgress;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeReconcileProductionBatchProgressController(input);
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};

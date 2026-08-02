import type { RequestHandler } from 'express';
import type { ReconcileProductionBatchProgressCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.port.ts';

export const makeReconcileProductionBatchProgressController = (input: {
  reconcile: ReconcileProductionBatchProgress;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.reconcile({
        ...(request.body as Omit<
          ReconcileProductionBatchProgressCommand,
          'locationId' | 'productionRunId' | 'productionBatchId'
        >),
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        productionBatchId: request.params['productionBatchId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });

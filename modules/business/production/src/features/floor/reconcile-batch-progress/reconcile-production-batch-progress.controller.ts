import {
  productionBatchProgressReconciliationParamsSchema,
  productionBatchProgressReconciliationResultSchema,
  reconcileProductionBatchProgressRequestSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toProductionBatchProgressReconciliationResult,
  toReconcileProductionBatchProgressCommand,
} from './reconcile-production-batch-progress.contract.mapper.ts';
import type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.port.ts';

export const makeReconcileProductionBatchProgressController = (input: {
  reconcile: ReconcileProductionBatchProgress;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionBatchProgressReconciliationParamsSchema,
      body: reconcileProductionBatchProgressRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      const command = toReconcileProductionBatchProgressCommand(body, {
        locationId: params.locationId,
        productionRunId: params.productionRunId,
        productionBatchId: params.productionBatchId,
        actorId: input.readActorId(response),
      });

      sendValidatedProductionResult(response, await input.reconcile(command), {
        schema: productionBatchProgressReconciliationResultSchema,
        present: toProductionBatchProgressReconciliationResult,
      });
    },
  });

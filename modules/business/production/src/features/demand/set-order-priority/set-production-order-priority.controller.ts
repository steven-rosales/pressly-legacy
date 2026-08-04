import {
  productionMutationResultSchema,
  productionOrderParamsSchema,
  setProductionOrderPriorityRequestSchema,
} from './set-production-order-priority.contract.mapper.ts';
import type { RequestHandler } from 'express';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toProductionOrderPriorityResult } from './set-production-order-priority.contract.mapper.ts';
import type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';

export const setProductionOrderPriorityBoundary = defineRequestBoundary({
  params: productionOrderParamsSchema,
  body: setProductionOrderPriorityRequestSchema,
});

export const makeSetProductionOrderPriorityController = (input: {
  setPriority: SetProductionOrderPriority;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  setProductionOrderPriorityBoundary.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.setPriority({
          priority: body.priority,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          locationId: params.locationId,
          productionOrderId: params.productionOrderId,
          actorId: input.readActorId(response),
        }),
        {
          schema: productionMutationResultSchema,
          present: toProductionOrderPriorityResult,
        },
      );
    },
  );

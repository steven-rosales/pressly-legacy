import {
  productionMutationResultSchema,
  productionOrderParamsSchema,
  setProductionOrderPriorityRequestSchema,
} from '@pressly/contracts/production';
import type { RequestHandler } from 'express';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toProductionOrderPriorityResult } from './set-production-order-priority.contract.mapper.ts';
import type { SetProductionOrderPriority } from './set-production-order-priority.port.ts';

export const makeSetProductionOrderPriorityController = (input: {
  setPriority: SetProductionOrderPriority;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionOrderParamsSchema,
      body: setProductionOrderPriorityRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
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
  });

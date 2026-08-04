import {
  changeProductionOrderResolutionRequestSchema,
  changeProductionOrderResolutionResultSchema,
  productionOrderParamsSchema,
} from './change-production-order-resolution.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toChangeProductionOrderResolutionCommand,
  toChangeProductionOrderResolutionResult,
} from './change-production-order-resolution.contract.mapper.ts';
import type { ChangeProductionOrderResolution } from './change-production-order-resolution.port.ts';

export const changeProductionOrderResolutionBoundary = defineRequestBoundary({
  params: productionOrderParamsSchema,
  body: changeProductionOrderResolutionRequestSchema,
});

export const makeChangeProductionOrderResolutionController = (input: {
  changeResolution: ChangeProductionOrderResolution;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  changeProductionOrderResolutionBoundary.handler(
    async ({ body, params }, { response }) => {
      const command = toChangeProductionOrderResolutionCommand(body, {
        locationId: params.locationId,
        orderId: params.productionOrderId,
        actorId: input.readActorId(response),
      });

      sendValidatedProductionResult(
        response,
        await input.changeResolution(command),
        {
          schema: changeProductionOrderResolutionResultSchema,
          present: toChangeProductionOrderResolutionResult,
        },
      );
    },
  );

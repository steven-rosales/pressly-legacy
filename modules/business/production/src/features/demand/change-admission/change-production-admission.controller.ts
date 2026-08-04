import {
  changeProductionAdmissionRequestSchema,
  changeProductionAdmissionResultSchema,
  productionOrderParamsSchema,
} from './change-production-admission.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toChangeProductionAdmissionResult } from './change-production-admission.contract.mapper.ts';
import type { ChangeProductionAdmission } from './change-production-admission.port.ts';

export const changeProductionAdmissionBoundary = defineRequestBoundary({
  params: productionOrderParamsSchema,
  body: changeProductionAdmissionRequestSchema,
});

export const makeChangeProductionAdmissionController = (input: {
  changeAdmission: ChangeProductionAdmission;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  changeProductionAdmissionBoundary.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.changeAdmission({
          target: body.target,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          locationId: params.locationId,
          orderId: params.productionOrderId,
          actorId: input.readActorId(response),
        }),
        {
          schema: changeProductionAdmissionResultSchema,
          present: toChangeProductionAdmissionResult,
        },
      );
    },
  );

import {
  productionOrderParamsSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
} from './record-order-intake.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toRecordOrderIntakeResult } from './record-order-intake.contract.mapper.ts';
import type { RecordOrderIntake } from './record-order-intake.port.ts';

export const recordOrderIntakeBoundary = defineRequestBoundary({
  params: productionOrderParamsSchema,
  body: recordOrderIntakeRequestSchema,
});

export const makeRecordOrderIntakeController = (input: {
  recordIntake: RecordOrderIntake;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  recordOrderIntakeBoundary.handler(async ({ body, params }, { response }) => {
    sendValidatedProductionResult(
      response,
      await input.recordIntake({
        bagCount: body.bagCount,
        expectedVersion: body.expectedVersion,
        idempotencyKey: body.idempotencyKey,
        locationId: params.locationId,
        orderId: params.productionOrderId,
        actorId: input.readActorId(response),
      }),
      {
        schema: recordOrderIntakeResultSchema,
        present: toRecordOrderIntakeResult,
      },
    );
  });

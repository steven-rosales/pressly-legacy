import {
  productionOrderParamsSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toRecordOrderIntakeResult } from './record-order-intake.contract.mapper.ts';
import type { RecordOrderIntake } from './record-order-intake.port.ts';

export const makeRecordOrderIntakeController = (input: {
  recordIntake: RecordOrderIntake;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionOrderParamsSchema,
      body: recordOrderIntakeRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
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
    },
  });

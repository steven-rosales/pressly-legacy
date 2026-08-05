import { defineValidatedController } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  productionShiftParamsSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from '@pressly/contracts/production';
import {
  toUpdateProductionShiftCommand,
  toUpdateProductionShiftResult,
} from './update-production-shift.contract.mapper.ts';
import type { UpdateProductionShift } from './update-production-shift.port.ts';

export const makeUpdateProductionShiftController = (input: {
  update: UpdateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionShiftParamsSchema,
      body: updateProductionShiftRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.update({
          ...toUpdateProductionShiftCommand(
            params.locationId,
            params.productionShiftId,
            body,
          ),
          actorId: input.readActorId(response),
        }),
        {
          schema: updateProductionShiftResultSchema,
          present: toUpdateProductionShiftResult,
        },
      );
    },
  });

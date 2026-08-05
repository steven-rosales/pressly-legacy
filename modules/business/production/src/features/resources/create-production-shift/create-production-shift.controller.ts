import { defineValidatedController } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
  productionShiftSchema,
} from '@pressly/contracts/production';
import {
  toCreateProductionShiftCommand,
  toProductionShiftResult,
} from './create-production-shift.contract.mapper.ts';
import type { CreateProductionShift } from './create-production-shift.port.ts';

export const makeCreateProductionShiftController = (input: {
  create: CreateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: createProductionShiftRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.create({
          ...toCreateProductionShiftCommand(params.locationId, body),
          actorId: input.readActorId(response),
        }),
        {
          successStatus: 201,
          schema: productionShiftSchema,
          present: toProductionShiftResult,
        },
      );
    },
  });

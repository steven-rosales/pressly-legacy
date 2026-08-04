import {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
  productionShiftParamsSchema,
  productionShiftSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from './manage-production-shift.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toCreateProductionShiftCommand,
  toProductionShiftResult,
  toUpdateProductionShiftCommand,
  toUpdateProductionShiftResult,
} from './manage-production-shift.contract.mapper.ts';
import type {
  CreateProductionShift,
  UpdateProductionShift,
} from './manage-production-shift.port.ts';

export const createProductionShiftBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  body: createProductionShiftRequestSchema,
});

export const updateProductionShiftBoundary = defineRequestBoundary({
  params: productionShiftParamsSchema,
  body: updateProductionShiftRequestSchema,
});

export const makeCreateProductionShiftController = (input: {
  create: CreateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  createProductionShiftBoundary.handler(
    async ({ body, params }, { response }) => {
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
  );

export const makeUpdateProductionShiftController = (input: {
  update: UpdateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  updateProductionShiftBoundary.handler(
    async ({ body, params }, { response }) => {
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
  );

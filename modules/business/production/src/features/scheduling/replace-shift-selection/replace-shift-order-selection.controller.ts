import {
  productionShiftParamsSchema,
  replaceProductionShiftSelectionRequestSchema,
  replaceProductionShiftSelectionResultSchema,
} from './replace-shift-order-selection.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toReplaceProductionShiftSelectionResult } from './replace-shift-order-selection.contract.mapper.ts';
import type { ReplaceShiftOrderSelection } from './replace-shift-order-selection.port.ts';

export const replaceShiftOrderSelectionBoundary = defineRequestBoundary({
  params: productionShiftParamsSchema,
  body: replaceProductionShiftSelectionRequestSchema,
});

export const makeReplaceShiftOrderSelectionController = (input: {
  replace: ReplaceShiftOrderSelection;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  replaceShiftOrderSelectionBoundary.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.replace({
          selectedOrderIds: body.selectedOrderIds,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          locationId: params.locationId,
          productionShiftId: params.productionShiftId,
          actorId: input.readActorId(response),
        }),
        {
          schema: replaceProductionShiftSelectionResultSchema,
          present: toReplaceProductionShiftSelectionResult,
        },
      );
    },
  );

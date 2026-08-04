import {
  automaticProductionOrderPlacementResultSchema,
  confirmProductionOrderOvertimeRequestSchema,
  confirmProductionOrderOvertimeResultSchema,
  exactProductionOrderPlacementResultSchema,
  placeProductionOrderAutomaticallyRequestSchema,
  placeProductionOrderExactlyRequestSchema,
  productionIdSchema,
  productionRunParamsSchema,
} from './place-production-order.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toAutomaticProductionOrderPlacementResult,
  toConfirmProductionOrderOvertimeCommand,
  toConfirmProductionOrderOvertimeResult,
  toExactProductionOrderPlacementResult,
  toPlaceProductionOrderAutomaticallyCommand,
  toPlaceProductionOrderExactlyCommand,
} from './place-production-order.contract.mapper.ts';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from './place-production-order.port.ts';

const runOrderParamsSchema = productionRunParamsSchema
  .extend({ productionOrderId: productionIdSchema })
  .strict();

const runBatchOrderParamsSchema = runOrderParamsSchema
  .extend({ productionBatchId: productionIdSchema })
  .strict();

export const placeProductionOrderBoundaries = {
  automatic: defineRequestBoundary({
    params: runOrderParamsSchema,
    body: placeProductionOrderAutomaticallyRequestSchema,
  }),
  exact: defineRequestBoundary({
    params: runBatchOrderParamsSchema,
    body: placeProductionOrderExactlyRequestSchema,
  }),
  confirmOvertime: defineRequestBoundary({
    params: runOrderParamsSchema,
    body: confirmProductionOrderOvertimeRequestSchema,
  }),
} as const;

type ControllerInput = Readonly<{
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}>;

export const makePlaceProductionOrderAutomaticallyController = (
  input: ControllerInput & {
    place: PlaceProductionOrderAutomatically;
  },
): RequestHandler =>
  placeProductionOrderBoundaries.automatic.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.place(
          toPlaceProductionOrderAutomaticallyCommand(
            {
              locationId: params.locationId,
              productionRunId: params.productionRunId,
              productionOrderId: params.productionOrderId,
              actorId: input.readActorId(response),
              authorizedAction: 'production:override',
            },
            body,
          ),
        ),
        {
          schema: automaticProductionOrderPlacementResultSchema,
          present: toAutomaticProductionOrderPlacementResult,
        },
      );
    },
  );

export const makePlaceProductionOrderExactlyController = (
  input: ControllerInput & { place: PlaceProductionOrderExactly },
): RequestHandler =>
  placeProductionOrderBoundaries.exact.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.place(
          toPlaceProductionOrderExactlyCommand(
            {
              locationId: params.locationId,
              productionRunId: params.productionRunId,
              productionBatchId: params.productionBatchId,
              productionOrderId: params.productionOrderId,
              actorId: input.readActorId(response),
              authorizedAction: 'production:override',
            },
            body,
          ),
        ),
        {
          schema: exactProductionOrderPlacementResultSchema,
          present: toExactProductionOrderPlacementResult,
        },
      );
    },
  );

export const makeConfirmProductionOrderOvertimeController = (
  input: ControllerInput & { confirm: ConfirmProductionOrderOvertime },
): RequestHandler =>
  placeProductionOrderBoundaries.confirmOvertime.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.confirm(
          toConfirmProductionOrderOvertimeCommand(
            {
              locationId: params.locationId,
              productionRunId: params.productionRunId,
              productionOrderId: params.productionOrderId,
              actorId: input.readActorId(response),
              authorizedAction: 'production:override',
            },
            body,
          ),
        ),
        {
          schema: confirmProductionOrderOvertimeResultSchema,
          present: toConfirmProductionOrderOvertimeResult,
        },
      );
    },
  );

import {
  advanceProductionStageResultSchema,
  completeStageRequestSchema,
  productionStageParamsSchema,
  startStageRequestSchema,
} from './advance-production-stage.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toAdvanceProductionStageResult,
  toCompleteProductionStageCommand,
  toStartProductionStageCommand,
} from './advance-production-stage.contract.mapper.ts';
import type { AdvanceProductionStage } from './advance-production-stage.port.ts';

export const advanceProductionStageBoundaries = {
  start: defineRequestBoundary({
    params: productionStageParamsSchema,
    body: startStageRequestSchema,
  }),
  complete: defineRequestBoundary({
    params: productionStageParamsSchema,
    body: completeStageRequestSchema,
  }),
} as const;

export const makeAdvanceProductionStageController = (input: {
  advance: AdvanceProductionStage;
  transition: 'start' | 'complete';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  advanceProductionStageBoundaries[input.transition].handler(
    async ({ body, params }, { response }) => {
      const scope = {
        locationId: params.locationId,
        stageRunId: params.stageRunId,
        actorId: input.readActorId(response),
      };
      const outcome =
        input.transition === 'start'
          ? await input.advance(toStartProductionStageCommand(body, scope))
          : await input.advance(toCompleteProductionStageCommand(body, scope));

      sendValidatedProductionResult(response, outcome, {
        schema: advanceProductionStageResultSchema,
        present: toAdvanceProductionStageResult,
      });
    },
  );

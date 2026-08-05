import {
  advanceProductionStageResultSchema,
  completeStageRequestSchema,
  productionStageParamsSchema,
  startStageRequestSchema,
} from '@pressly/contracts/production';
import {
  defineValidatedController,
  type ValidatedController,
} from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toAdvanceProductionStageResult,
  toCompleteProductionStageCommand,
  toStartProductionStageCommand,
} from './advance-production-stage.contract.mapper.ts';
import type { AdvanceProductionStage } from './advance-production-stage.port.ts';

export const makeAdvanceProductionStageController = (input: {
  advance: AdvanceProductionStage;
  transition: 'start' | 'complete';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): ValidatedController => {
  if (input.transition === 'start')
    return defineValidatedController({
      request: {
        params: productionStageParamsSchema,
        body: startStageRequestSchema,
      },
      handle: async ({ body, params }, { response }) => {
        const outcome = await input.advance(
          toStartProductionStageCommand(body, {
            locationId: params.locationId,
            stageRunId: params.stageRunId,
            actorId: input.readActorId(response),
          }),
        );

        sendValidatedProductionResult(response, outcome, {
          schema: advanceProductionStageResultSchema,
          present: toAdvanceProductionStageResult,
        });
      },
    });

  return defineValidatedController({
    request: {
      params: productionStageParamsSchema,
      body: completeStageRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      const scope = {
        locationId: params.locationId,
        stageRunId: params.stageRunId,
        actorId: input.readActorId(response),
      };
      const outcome = await input.advance(
        toCompleteProductionStageCommand(body, scope),
      );

      sendValidatedProductionResult(response, outcome, {
        schema: advanceProductionStageResultSchema,
        present: toAdvanceProductionStageResult,
      });
    },
  });
};

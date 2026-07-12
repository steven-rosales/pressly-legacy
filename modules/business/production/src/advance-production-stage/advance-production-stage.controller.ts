import type { RequestHandler } from 'express';
import type { StageCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { AdvanceProductionStage } from './advance-production-stage.port.ts';

export const makeAdvanceProductionStageController = (input: {
  advance: AdvanceProductionStage;
  transition: 'start' | 'complete';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.advance({
        ...(request.body as Omit<StageCommand, 'locationId' | 'stageRunId'>),
        locationId: request.params['locationId'] as string,
        stageRunId: request.params['stageRunId'] as string,
        actorId: input.readActorId(response),
        transition: input.transition,
      }),
    );
  });

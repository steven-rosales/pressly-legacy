import type { RequestHandler } from 'express';
import type {
  CompleteStageCommand,
  StartStageCommand,
} from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { AdvanceProductionStage } from './advance-production-stage.port.ts';

export const makeAdvanceProductionStageController = (input: {
  advance: AdvanceProductionStage;
  transition: 'start' | 'complete';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    const target = {
      locationId: request.params['locationId'] as string,
      stageRunId: request.params['stageRunId'] as string,
      actorId: input.readActorId(response),
    };
    if (input.transition === 'start') {
      sendApiResult(
        response,
        await input.advance({
          ...(request.body as Omit<
            StartStageCommand,
            'locationId' | 'stageRunId'
          >),
          ...target,
          transition: 'start',
        }),
      );
      return;
    }

    sendApiResult(
      response,
      await input.advance({
        ...(request.body as Omit<
          CompleteStageCommand,
          'locationId' | 'stageRunId'
        >),
        ...target,
        transition: 'complete',
      }),
    );
  });

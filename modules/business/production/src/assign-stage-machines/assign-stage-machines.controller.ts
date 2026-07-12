import type { RequestHandler } from 'express';
import type { AssignStageMachinesCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const makeAssignStageMachinesController = (input: {
  assign: AssignStageMachines;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.assign({
        ...(request.body as Omit<
          AssignStageMachinesCommand,
          'locationId' | 'stageRunId'
        >),
        locationId: request.params['locationId'] as string,
        stageRunId: request.params['stageRunId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });

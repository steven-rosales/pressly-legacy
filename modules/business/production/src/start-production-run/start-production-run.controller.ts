import type { RequestHandler } from 'express';
import type { ProductionRunCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { StartProductionRun } from './start-production-run.port.ts';

export const makeStartProductionRunController = (input: {
  startRun: StartProductionRun;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.startRun({
        ...(request.body as Omit<
          ProductionRunCommand,
          'locationId' | 'productionRunId'
        >),
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });

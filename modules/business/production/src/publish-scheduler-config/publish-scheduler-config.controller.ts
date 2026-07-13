import type { RequestHandler } from 'express';
import type { PublishSchedulerConfigCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';

export const makePublishSchedulerConfigController = (input: {
  publish: PublishSchedulerConfig;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.publish({
        ...(request.body as Omit<PublishSchedulerConfigCommand, 'locationId'>),
        locationId: request.params['locationId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });

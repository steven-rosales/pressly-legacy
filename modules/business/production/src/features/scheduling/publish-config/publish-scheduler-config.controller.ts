import {
  productionLocationParamsSchema,
  publishSchedulerConfigRequestSchema,
  schedulerConfigSchema,
} from './publish-scheduler-config.contract.mapper.ts';
import type { RequestHandler } from 'express';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toSchedulerConfigResult } from './publish-scheduler-config.contract.mapper.ts';
import type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';

export const publishSchedulerConfigBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  body: publishSchedulerConfigRequestSchema,
});

export const makePublishSchedulerConfigController = (input: {
  publish: PublishSchedulerConfig;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  publishSchedulerConfigBoundary.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.publish({
          pulseMinutes: body.pulseMinutes,
          foldLbsPerFolderMinute: body.foldLbsPerFolderMinute,
          stageFitAssertion: body.stageFitAssertion,
          idempotencyKey: body.idempotencyKey,
          locationId: params.locationId,
          actorId: input.readActorId(response),
        }),
        {
          schema: schedulerConfigSchema,
          present: toSchedulerConfigResult,
          successStatus: 201,
        },
      );
    },
  );

import {
  productionLocationParamsSchema,
  publishSchedulerConfigRequestSchema,
  schedulerConfigSchema,
} from '@pressly/contracts/production';
import type { RequestHandler } from 'express';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toSchedulerConfigResult } from './publish-scheduler-config.contract.mapper.ts';
import type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';

export const makePublishSchedulerConfigController = (input: {
  publish: PublishSchedulerConfig;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: publishSchedulerConfigRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
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
  });

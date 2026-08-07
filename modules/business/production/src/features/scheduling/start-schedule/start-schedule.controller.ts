import {
  productionScheduleParamsSchema,
  startScheduleRequestSchema,
  startScheduleResultSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toStartScheduleCommand,
  toStartScheduleResult,
} from './start-schedule.contract.mapper.ts';
import type { StartSchedule } from './start-schedule.port.ts';

export const makeStartScheduleController = (input: {
  startSchedule: StartSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionScheduleParamsSchema,
      body: startScheduleRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.startSchedule(
          toStartScheduleCommand(
            {
              locationId: params.locationId,
              scheduleRunId: params.scheduleRunId,
              actorId: input.readActorId(response),
            },
            body,
          ),
        ),
        {
          schema: startScheduleResultSchema,
          present: toStartScheduleResult,
          successStatus: 201,
        },
      );
    },
  });

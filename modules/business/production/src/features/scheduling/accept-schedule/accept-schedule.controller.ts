import {
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  productionScheduleParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toAcceptScheduleCommand,
  toAcceptScheduleResult,
} from './accept-schedule.contract.mapper.ts';
import type { AcceptSchedule } from './accept-schedule.port.ts';

export const makeAcceptScheduleController = (input: {
  acceptSchedule: AcceptSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionScheduleParamsSchema,
      body: acceptScheduleRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.acceptSchedule(
          toAcceptScheduleCommand(
            {
              locationId: params.locationId,
              scheduleRunId: params.scheduleRunId,
              actorId: input.readActorId(response),
            },
            body,
          ),
        ),
        {
          schema: acceptScheduleResultSchema,
          present: toAcceptScheduleResult,
          successStatus: 201,
        },
      );
    },
  });

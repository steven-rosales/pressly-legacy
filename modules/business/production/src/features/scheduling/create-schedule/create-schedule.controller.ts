import {
  createScheduleRequestSchema,
  productionLocationParamsSchema,
  scheduleProposalSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toCreateScheduleCommand,
  toCreateScheduleResult,
} from './create-schedule.contract.mapper.ts';
import type { CreateSchedule } from './create-schedule.port.ts';

export const makeCreateScheduleController = (input: {
  createSchedule: CreateSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: createScheduleRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.createSchedule(
          toCreateScheduleCommand(
            {
              locationId: params.locationId,
              actorId: input.readActorId(response),
            },
            body,
          ),
        ),
        {
          schema: scheduleProposalSchema,
          present: toCreateScheduleResult,
          successStatus: 201,
        },
      );
    },
  });

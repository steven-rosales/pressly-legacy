import {
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  productionScheduleParamsSchema,
} from './accept-schedule.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toAcceptScheduleCommand,
  toAcceptScheduleResult,
} from './accept-schedule.contract.mapper.ts';
import type { AcceptSchedule } from './accept-schedule.port.ts';

export const acceptScheduleBoundary = defineRequestBoundary({
  params: productionScheduleParamsSchema,
  body: acceptScheduleRequestSchema,
});

export const makeAcceptScheduleController = (input: {
  acceptSchedule: AcceptSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  acceptScheduleBoundary.handler(async ({ body, params }, { response }) => {
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
  });

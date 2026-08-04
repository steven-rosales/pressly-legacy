import {
  productionScheduleParamsSchema,
  startScheduleRequestSchema,
  startScheduleResultSchema,
} from './start-schedule.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toStartScheduleCommand,
  toStartScheduleResult,
} from './start-schedule.contract.mapper.ts';
import type { StartSchedule } from './start-schedule.port.ts';

export const startScheduleBoundary = defineRequestBoundary({
  params: productionScheduleParamsSchema,
  body: startScheduleRequestSchema,
});

export const makeStartScheduleController = (input: {
  startSchedule: StartSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  startScheduleBoundary.handler(async ({ body, params }, { response }) => {
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
  });

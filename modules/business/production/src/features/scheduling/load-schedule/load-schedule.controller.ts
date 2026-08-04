import {
  productionScheduleParamsSchema,
  scheduleProposalSchema,
} from './load-schedule.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toLoadScheduleCommand,
  toLoadScheduleResult,
} from './load-schedule.contract.mapper.ts';
import type { LoadSchedule } from './load-schedule.port.ts';

export const loadScheduleBoundary = defineRequestBoundary({
  params: productionScheduleParamsSchema,
});

export const makeLoadScheduleController = (
  loadSchedule: LoadSchedule,
): RequestHandler =>
  loadScheduleBoundary.handler(async ({ params }, { response }) => {
    sendValidatedProductionResult(
      response,
      await loadSchedule(toLoadScheduleCommand(params)),
      {
        schema: scheduleProposalSchema,
        present: toLoadScheduleResult,
      },
    );
  });

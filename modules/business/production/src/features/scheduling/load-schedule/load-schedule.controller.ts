import {
  productionScheduleParamsSchema,
  scheduleProposalSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toLoadScheduleCommand,
  toLoadScheduleResult,
} from './load-schedule.contract.mapper.ts';
import type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadScheduleController = (loadSchedule: LoadSchedule) =>
  defineValidatedController({
    request: { params: productionScheduleParamsSchema },
    handle: async ({ params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await loadSchedule(toLoadScheduleCommand(params)),
        {
          schema: scheduleProposalSchema,
          present: toLoadScheduleResult,
        },
      );
    },
  });

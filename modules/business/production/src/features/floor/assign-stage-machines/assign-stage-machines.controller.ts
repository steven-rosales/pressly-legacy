import {
  assignStageMachinesRequestSchema,
  productionMutationResultSchema,
  productionStageParamsSchema,
} from '@pressly/contracts/production';
import type { RequestHandler } from 'express';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toAssignStageMachinesResult } from './assign-stage-machines.contract.mapper.ts';
import type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const makeAssignStageMachinesController = (input: {
  assign: AssignStageMachines;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionStageParamsSchema,
      body: assignStageMachinesRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.assign({
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          machineIds: body.machineIds,
          locationId: params.locationId,
          stageRunId: params.stageRunId,
          actorId: input.readActorId(response),
        }),
        {
          schema: productionMutationResultSchema,
          present: toAssignStageMachinesResult,
        },
      );
    },
  });

import {
  assignStageMachinesRequestSchema,
  productionMutationResultSchema,
  productionStageParamsSchema,
} from './assign-stage-machines.contract.mapper.ts';
import type { RequestHandler } from 'express';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import { toAssignStageMachinesResult } from './assign-stage-machines.contract.mapper.ts';
import type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const assignStageMachinesBoundary = defineRequestBoundary({
  params: productionStageParamsSchema,
  body: assignStageMachinesRequestSchema,
});

export const makeAssignStageMachinesController = (input: {
  assign: AssignStageMachines;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  assignStageMachinesBoundary.handler(
    async ({ body, params }, { response }) => {
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
  );

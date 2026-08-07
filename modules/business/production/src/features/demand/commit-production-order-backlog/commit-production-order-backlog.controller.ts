import { defineValidatedController } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  commitProductionOrderBacklogRequestSchema,
  productionLocationParamsSchema,
  productionOrderBacklogCommitResultSchema,
} from '@pressly/contracts/production';
import {
  toCommitProductionOrderBacklogCommand,
  toProductionOrderBacklogCommitResult,
} from './commit-production-order-backlog.contract.mapper.ts';
import type { CommitProductionOrderBacklog } from './commit-production-order-backlog.port.ts';

export const makeCommitProductionOrderBacklogController = (input: {
  commit: CommitProductionOrderBacklog;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: commitProductionOrderBacklogRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.commit(
          toCommitProductionOrderBacklogCommand(body, {
            locationId: params.locationId,
            actorId: input.readActorId(response),
          }),
        ),
        {
          schema: productionOrderBacklogCommitResultSchema,
          present: toProductionOrderBacklogCommitResult,
        },
      );
    },
  });

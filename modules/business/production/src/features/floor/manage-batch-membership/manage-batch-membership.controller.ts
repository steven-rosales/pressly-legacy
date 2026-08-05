import {
  freezeProductionBatchRequestSchema,
  productionBatchMembershipMutationResultSchema,
  productionIdSchema,
  productionRunParamsSchema,
  unfreezeProductionBatchRequestSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import { toProductionBatchMembershipMutationResult } from './manage-batch-membership.contract.mapper.ts';
import type { BatchMembershipAction } from './manage-batch-membership.model.ts';
import type { ManageBatchMembership } from './manage-batch-membership.port.ts';

const productionBatchParamsSchema = productionRunParamsSchema
  .extend({ productionBatchId: productionIdSchema })
  .strict();

export const makeManageBatchMembershipController = (input: {
  manage: ManageBatchMembership;
  action: BatchMembershipAction;
  authorizedAction: 'production:queue' | 'production:override';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}) =>
  defineValidatedController({
    request: {
      params: productionBatchParamsSchema,
      body:
        input.action === 'freeze'
          ? freezeProductionBatchRequestSchema
          : unfreezeProductionBatchRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.manage({
          expectedQueueVersion: body.expectedQueueVersion,
          expectedBatchVersion: body.expectedBatchVersion,
          idempotencyKey: body.idempotencyKey,
          locationId: params.locationId,
          productionRunId: params.productionRunId,
          productionBatchId: params.productionBatchId,
          action: input.action,
          actorId: input.readActorId(response),
          authorizedAction: input.authorizedAction,
        }),
        {
          schema: productionBatchMembershipMutationResultSchema,
          present: toProductionBatchMembershipMutationResult,
        },
      );
    },
  });

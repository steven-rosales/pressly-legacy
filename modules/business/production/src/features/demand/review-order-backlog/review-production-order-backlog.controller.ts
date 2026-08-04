import {
  commitProductionOrderBacklogRequestSchema,
  previewProductionOrderBacklogRequestSchema,
  productionLocationParamsSchema,
  productionOrderBacklogCommitResultSchema,
  productionOrderBacklogPreviewSchema,
} from './review-production-order-backlog.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toCommitProductionOrderBacklogCommand,
  toPreviewProductionOrderBacklogCommand,
  toProductionOrderBacklogCommitResult,
  toProductionOrderBacklogPreviewResult,
} from './review-production-order-backlog.contract.mapper.ts';
import type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
} from './review-production-order-backlog.port.ts';

export const previewProductionOrderBacklogBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  body: previewProductionOrderBacklogRequestSchema,
});

export const commitProductionOrderBacklogBoundary = defineRequestBoundary({
  params: productionLocationParamsSchema,
  body: commitProductionOrderBacklogRequestSchema,
});

export const makePreviewProductionOrderBacklogController = (input: {
  preview: PreviewProductionOrderBacklog;
}): RequestHandler =>
  previewProductionOrderBacklogBoundary.handler(
    async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.preview(
          toPreviewProductionOrderBacklogCommand(body, params.locationId),
        ),
        {
          schema: productionOrderBacklogPreviewSchema,
          present: toProductionOrderBacklogPreviewResult,
        },
      );
    },
  );

export const makeCommitProductionOrderBacklogController = (input: {
  commit: CommitProductionOrderBacklog;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  commitProductionOrderBacklogBoundary.handler(
    async ({ body, params }, { response }) => {
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
  );

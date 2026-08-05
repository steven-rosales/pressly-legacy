import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  previewProductionOrderBacklogRequestSchema,
  productionLocationParamsSchema,
  productionOrderBacklogPreviewSchema,
} from '@pressly/contracts/production';
import {
  toPreviewProductionOrderBacklogCommand,
  toProductionOrderBacklogPreviewResult,
} from './preview-production-order-backlog.contract.mapper.ts';
import type { PreviewProductionOrderBacklog } from './preview-production-order-backlog.port.ts';

export const makePreviewProductionOrderBacklogController = (input: {
  preview: PreviewProductionOrderBacklog;
}) =>
  defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: previewProductionOrderBacklogRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
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
  });

import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
  productionWorkspaceSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toLoadProductionWorkspaceCommand,
  toProductionWorkspaceResult,
} from './load-production-workspace.contract.mapper.ts';
import type { LoadProductionWorkspace } from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspaceController = (
  loadWorkspace: LoadProductionWorkspace,
) =>
  defineValidatedController({
    request: {
      params: productionWorkspaceParamsSchema,
      query: productionWorkspaceQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
      sendValidatedProductionResult(
        response,
        await loadWorkspace(
          toLoadProductionWorkspaceCommand({ params, query }),
        ),
        {
          schema: productionWorkspaceSchema,
          present: toProductionWorkspaceResult,
        },
      );
    },
  });

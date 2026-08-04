import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
  productionWorkspaceSchema,
} from './load-production-workspace.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toLoadProductionWorkspaceCommand,
  toProductionWorkspaceResult,
} from './load-production-workspace.contract.mapper.ts';
import type { LoadProductionWorkspace } from './load-production-workspace.port.ts';

export const loadProductionWorkspaceBoundary = defineRequestBoundary({
  params: productionWorkspaceParamsSchema,
  query: productionWorkspaceQuerySchema,
});

export const makeLoadProductionWorkspaceController = (
  loadWorkspace: LoadProductionWorkspace,
): RequestHandler =>
  loadProductionWorkspaceBoundary.handler(
    async ({ params, query }, { response }) => {
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
  );

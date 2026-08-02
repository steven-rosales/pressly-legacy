import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { LoadProductionWorkspace } from './load-production-workspace.port.ts';

export const makeLoadProductionWorkspaceController = (
  loadWorkspace: LoadProductionWorkspace,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await loadWorkspace({
        locationId: request.params['locationId'] as string,
        ...(typeof request.query['shiftId'] === 'string'
          ? { shiftId: request.query['shiftId'] }
          : {}),
      }),
    );
  });

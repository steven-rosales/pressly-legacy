import express, { type RequestHandler, type Router } from 'express';
import { bindCell, defineHttpCatalog } from '@pressly/cells';
import { listDeadEventsCellDeclaration } from '@pressly/ingress-system/operations/inbox/list-dead-events/cell';
import { replayDeadEventCellDeclaration } from '@pressly/ingress-system/operations/inbox/replay-dead-event/cell';
import type { IngressStateSystem } from '@pressly/ingress-system/testing/assembly';
import {
  continueApiCatalogRequest,
  invokeApiCatalogMiddleware,
} from '@pressly/http-host/runtime';
import { mountHttpCatalog } from '@pressly/http-host';

export const makeWebhookIngestionRoutes = (input: {
  cells: Readonly<{
    listDeadEvents: Pick<
      IngressStateSystem['cells']['listDeadEvents'],
      'execute'
    >;
    replayDeadEvent: Pick<
      IngressStateSystem['cells']['replayDeadEvent'],
      'execute'
    >;
  }>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = express.Router();
  const catalog = defineHttpCatalog([
    bindCell(listDeadEventsCellDeclaration, input.cells.listDeadEvents.execute),
    bindCell(
      replayDeadEventCellDeclaration,
      input.cells.replayDeadEvent.execute,
    ),
  ]);
  mountHttpCatalog({
    router,
    catalog,
    dependencies: {
      requestContext: () => continueApiCatalogRequest,
      authentication: () => input.authenticate,
      body: ({ limit }) => express.json({ limit: limit ?? '64kb' }),
      readCellContext: () => Object.freeze({}),
      authorize: async ({ request, response }) =>
        invokeApiCatalogMiddleware(input.authorize, request, response),
    },
  });
  return router;
};

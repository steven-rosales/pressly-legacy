import {
  deadWebhookEventParamsSchema,
  deadWebhookEventsResultSchema,
  deadWebhookEventsQuerySchema,
  replayDeadWebhookEventRequestSchema,
  replayDeadWebhookEventResultSchema,
} from '@pressly/contracts/webhook-ingestion';
import {
  defineRequestBoundary,
  sendValidatedApiResult,
} from '@pressly/http/express';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { Router, type RequestHandler } from 'express';
import {
  toDeadWebhookEventsResult,
  toListDeadWebhookEventsQuery,
  toReplayDeadWebhookEventError,
  toReplayDeadWebhookEventResult,
} from './dead-letter.contract.mapper.ts';

const listDeadWebhookEventsBoundary = defineRequestBoundary({
  query: deadWebhookEventsQuerySchema,
});

const replayDeadWebhookEventBoundary = defineRequestBoundary({
  params: deadWebhookEventParamsSchema,
  body: replayDeadWebhookEventRequestSchema,
});

export const makeWebhookIngestionRoutes = (input: {
  application: Pick<
    WebhookIngestionApplication,
    'listDeadEvents' | 'replayDeadEvent'
  >;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();

  router.get(
    '/webhook-ingestion/dead-letters',
    input.authenticate,
    listDeadWebhookEventsBoundary.validate,
    input.authorize,
    listDeadWebhookEventsBoundary.handler(async ({ query }, { response }) => {
      const listed = await input.application.listDeadEvents(
        toListDeadWebhookEventsQuery(query),
      );
      sendValidatedApiResult(response, listed, {
        schema: deadWebhookEventsResultSchema,
        present: toDeadWebhookEventsResult,
      });
    }),
  );

  router.post(
    '/webhook-ingestion/dead-letters/:eventId/replay',
    input.authenticate,
    replayDeadWebhookEventBoundary.validate,
    input.authorize,
    replayDeadWebhookEventBoundary.handler(async ({ params }, { response }) => {
      const replayed = await input.application.replayDeadEvent({
        eventId: params.eventId,
      });
      if (replayed.tag === 'err')
        throw toReplayDeadWebhookEventError(replayed.error);
      sendValidatedApiResult(response, replayed, {
        schema: replayDeadWebhookEventResultSchema,
        present: toReplayDeadWebhookEventResult,
      });
    }),
  );
  return router;
};

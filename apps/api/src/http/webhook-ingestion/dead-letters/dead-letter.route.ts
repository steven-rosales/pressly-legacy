import {
  deadWebhookEventParamsSchema,
  deadWebhookEventsResultSchema,
  deadWebhookEventsQuerySchema,
  replayDeadWebhookEventRequestSchema,
  replayDeadWebhookEventResultSchema,
} from '@pressly/contracts/webhook-ingestion';
import {
  defineValidatedController,
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

export const makeWebhookIngestionRoutes = (input: {
  application: Pick<
    WebhookIngestionApplication,
    'listDeadEvents' | 'replayDeadEvent'
  >;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const listController = defineValidatedController({
    request: { query: deadWebhookEventsQuerySchema },
    handle: async ({ query }, { response }) => {
      const listed = await input.application.listDeadEvents(
        toListDeadWebhookEventsQuery(query),
      );
      sendValidatedApiResult(response, listed, {
        schema: deadWebhookEventsResultSchema,
        present: toDeadWebhookEventsResult,
      });
    },
  });
  const replayController = defineValidatedController({
    request: {
      params: deadWebhookEventParamsSchema,
      body: replayDeadWebhookEventRequestSchema,
    },
    handle: async ({ params }, { response }) => {
      const replayed = await input.application.replayDeadEvent({
        eventId: params.eventId,
      });
      if (replayed.tag === 'err')
        throw toReplayDeadWebhookEventError(replayed.error);
      sendValidatedApiResult(response, replayed, {
        schema: replayDeadWebhookEventResultSchema,
        present: toReplayDeadWebhookEventResult,
      });
    },
  });

  router.get(
    '/webhook-ingestion/dead-letters',
    input.authenticate,
    listController.validate,
    input.authorize,
    listController.handle,
  );

  router.post(
    '/webhook-ingestion/dead-letters/:eventId/replay',
    input.authenticate,
    replayController.validate,
    input.authorize,
    replayController.handle,
  );
  return router;
};

import {
  deadWebhookEventParamsSchema,
  deadWebhookEventsQuerySchema,
  replayDeadWebhookEventRequestSchema,
  type DeadWebhookEventsQuery,
  type ReplayDeadWebhookEventRequest,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { Router, type RequestHandler } from 'express';

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
    validateRequest({ query: deadWebhookEventsQuerySchema }),
    input.authorize,
    catchAsync(async (request, response) => {
      const result = await input.application.listDeadEvents(
        request.query as unknown as DeadWebhookEventsQuery,
      );
      if (result.tag === 'err') throw result.error;
      response.json(apiSuccess(result.value));
    }),
  );

  router.post(
    '/webhook-ingestion/dead-letters/:eventId/replay',
    input.authenticate,
    validateRequest({
      params: deadWebhookEventParamsSchema,
      body: replayDeadWebhookEventRequestSchema,
    }),
    input.authorize,
    catchAsync(async (request, response) => {
      const result = await input.application.replayDeadEvent({
        eventId: request.params['eventId'] as string,
        ...(request.body as ReplayDeadWebhookEventRequest),
      });
      if (result.tag === 'err') throw result.error;
      response.json(apiSuccess(result.value));
    }),
  );
  return router;
};

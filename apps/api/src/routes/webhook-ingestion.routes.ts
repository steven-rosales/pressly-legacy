import {
  deadWebhookEventParamsSchema,
  deadWebhookEventsQuerySchema,
  replayDeadWebhookEventRequestSchema,
  type DeadWebhookEventsQuery,
  type ReplayDeadWebhookEventRequest,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { Router, type RequestHandler, type Response } from 'express';

type ApiResult<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{ tag: 'err'; error: AppError }>;

const send = <T>(response: Response, value: ApiResult<T>): void => {
  if (value.tag === 'err') {
    response.status(value.error.status).json(apiFailure(value.error));
    return;
  }
  response.json(apiSuccess(value.value));
};

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
      send(
        response,
        await input.application.listDeadEvents(
          request.query as unknown as DeadWebhookEventsQuery,
        ),
      );
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
      send(
        response,
        await input.application.replayDeadEvent({
          eventId: request.params['eventId'] as string,
          ...(request.body as ReplayDeadWebhookEventRequest),
        }),
      );
    }),
  );
  return router;
};

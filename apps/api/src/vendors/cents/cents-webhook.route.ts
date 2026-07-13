import { ingestWebhookEventCommandSchema } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import {
  catchAsync,
  requireJsonContentType,
  validateRequest,
} from '@pressly/http/express';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';
import express, { Router } from 'express';
import {
  makeCentsWebhookBoundary,
  type CentsWebhookVerifier,
} from './cents-webhook.security.ts';
import { makeCentsWebhookNormalizationBoundary } from './cents-webhook.middleware.ts';

type ApiResult<T> =
  | Readonly<{ tag: 'ok'; value: T }>
  | Readonly<{ tag: 'err'; error: AppError }>;

const send = <T>(response: express.Response, value: ApiResult<T>): void => {
  if (value.tag === 'err') {
    response.status(value.error.status).json(apiFailure(value.error));
    return;
  }
  response.status(202).json(apiSuccess(value.value));
};

export const makeCentsWebhookRoute = (input: {
  verifier: CentsWebhookVerifier;
  ingestEvent: WebhookIngestionApplication['ingestEvent'];
}): Router => {
  const router = Router();
  router.post(
    '/',
    requireJsonContentType(),
    express.raw({ type: 'application/json', limit: '256kb' }),
    makeCentsWebhookBoundary(input.verifier),
    makeCentsWebhookNormalizationBoundary(),
    validateRequest({ body: ingestWebhookEventCommandSchema }),
    catchAsync(async (request, response) => {
      send(response, await input.ingestEvent(request.body));
    }),
  );
  return router;
};

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
} from './cents-webhook.verifier.ts';
import {
  makeCentsWebhookNormalizationBoundary,
  readCentsWebhookQuarantineReceiptId,
} from './cents-webhook-normalization.middleware.ts';
import type { CentsWebhookPayloadCipher } from './cents-webhook.quarantine.ts';

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
  quarantine?: Readonly<{
    captureReceipt: WebhookIngestionApplication['captureReceipt'];
    linkReceipt: WebhookIngestionApplication['linkReceipt'];
    payloadCipher: CentsWebhookPayloadCipher;
  }>;
}): Router => {
  const router = Router();
  router.post(
    '/',
    (_request, response, next) => {
      response.locals['webhookSource'] = 'cents';
      next();
    },
    requireJsonContentType(),
    express.raw({ type: 'application/json', limit: '256kb' }),
    makeCentsWebhookBoundary(input.verifier),
    makeCentsWebhookNormalizationBoundary(input.quarantine),
    validateRequest({ body: ingestWebhookEventCommandSchema }),
    catchAsync(async (request, response) => {
      const ingested = await input.ingestEvent(request.body);
      if (ingested.tag === 'err') {
        send(response, ingested);
        return;
      }

      const receiptId = readCentsWebhookQuarantineReceiptId(response.locals);
      if (input.quarantine !== undefined && receiptId !== null) {
        const linked = await input.quarantine.linkReceipt({
          receiptId,
          eventId: ingested.value.eventId,
        });
        if (linked.tag === 'err') {
          send(response, linked);
          return;
        }
      }

      send(response, ingested);
    }),
  );
  return router;
};

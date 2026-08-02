import { ingestWebhookEventCommandSchema } from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
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
      if (ingested.tag === 'err') throw ingested.error;

      const receiptId = readCentsWebhookQuarantineReceiptId(response.locals);
      if (input.quarantine !== undefined && receiptId !== null) {
        const linked = await input.quarantine.linkReceipt({
          receiptId,
          eventId: ingested.value.eventId,
        });
        if (linked.tag === 'err') throw linked.error;
      }

      response.status(202).json(apiSuccess(ingested.value));
    }),
  );
  return router;
};

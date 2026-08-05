import {
  ingestWebhookEventCommandSchema,
  ingestWebhookEventResultSchema,
} from '@pressly/contracts/webhook-ingestion';
import {
  defineValidatedController,
  requireJsonContentType,
  sendValidatedApiResult,
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
import {
  toIngestWebhookEventCommand,
  toIngestWebhookEventResult,
  toLinkWebhookReceiptError,
} from './cents-webhook.contract.mapper.ts';

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
  const controller = defineValidatedController({
    request: { body: ingestWebhookEventCommandSchema },
    handle: async ({ body }, { response }) => {
      const ingested = await input.ingestEvent(
        toIngestWebhookEventCommand(body),
      );

      const receiptId = readCentsWebhookQuarantineReceiptId(response.locals);
      if (input.quarantine !== undefined && receiptId !== null) {
        const linked = await input.quarantine.linkReceipt({
          receiptId,
          eventId: ingested.value.eventId,
        });
        if (linked.tag === 'err') throw toLinkWebhookReceiptError(linked.error);
      }

      sendValidatedApiResult(response, ingested, {
        schema: ingestWebhookEventResultSchema,
        present: toIngestWebhookEventResult,
        successStatus: 202,
      });
    },
  });
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
    controller.validate,
    controller.handle,
  );
  return router;
};

import type { RequestHandler } from 'express';
import { makeAppError } from '@pressly/errors';
import type { WebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { readCentsWebhookRawBody } from './cents-webhook.security.ts';
import {
  hashCentsWebhookRawBody,
  normalizeCentsWebhook,
  toCentsWebhookEventCommand,
} from './cents-webhook.adapter.ts';
import {
  CENTS_WEBHOOK_ADAPTER_VERSION,
  type CentsWebhookPayloadCipher,
} from './cents-webhook.quarantine.ts';

const normalizationError = (input: { code: string; message: string }) =>
  makeAppError({
    kind: 'ValidationError',
    code: input.code,
    message: input.message,
    safeMessage: 'The vendor webhook body is invalid.',
    status: input.code === 'cents_webhook_body_too_large' ? 413 : 400,
  });

type CentsWebhookQuarantineBoundary = Readonly<{
  captureReceipt: WebhookIngestionApplication['captureReceipt'];
  payloadCipher: CentsWebhookPayloadCipher;
}>;

const quarantineReceiptKey = 'centsWebhookQuarantineReceiptId';

export const readCentsWebhookQuarantineReceiptId = (
  locals: Record<string, unknown>,
): string | null => {
  const receiptId = locals[quarantineReceiptKey];
  return typeof receiptId === 'string' ? receiptId : null;
};

export const makeCentsWebhookNormalizationBoundary =
  (quarantine?: CentsWebhookQuarantineBoundary): RequestHandler =>
  async (request, response, next) => {
    const rawBody = readCentsWebhookRawBody(response.locals);
    if (rawBody === null) {
      next(
        makeAppError({
          kind: 'ExternalServiceError',
          code: 'cents_webhook_raw_body_unavailable',
          message: 'Cents webhook raw body was unavailable.',
          safeMessage: 'Vendor webhook receipt is unavailable.',
          status: 503,
        }),
      );
      return;
    }

    const normalized = normalizeCentsWebhook({
      payload: request.body,
      rawBody,
    });

    if (quarantine !== undefined) {
      const captured = await quarantine.captureReceipt({
        source: 'cents',
        rawBodySha256: hashCentsWebhookRawBody(rawBody),
        adapterVersion: CENTS_WEBHOOK_ADAPTER_VERSION,
        eventType: normalized.ok ? normalized.value.receipt.eventKind : null,
        payloadCiphertext: quarantine.payloadCipher.encrypt(rawBody),
        normalization: normalized.ok
          ? { outcome: 'accepted' }
          : { outcome: 'rejected', errorCode: normalized.error.code },
      });
      if (captured.tag === 'err') {
        next(captured.error);
        return;
      }
      response.locals[quarantineReceiptKey] = captured.value.receiptId;
    }

    if (!normalized.ok) {
      next(normalizationError(normalized.error));
      return;
    }

    request.body = toCentsWebhookEventCommand(normalized.value);
    next();
  };

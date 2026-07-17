import type { RequestHandler } from 'express';
import { makeAppError } from '@pressly/errors';
import { readCentsWebhookRawBody } from './cents-webhook.security.ts';
import {
  normalizeCentsWebhook,
  toCentsWebhookEventCommand,
} from './cents-webhook.adapter.ts';

const normalizationError = (input: { code: string; message: string }) =>
  makeAppError({
    kind: 'ValidationError',
    code: input.code,
    message: input.message,
    safeMessage: 'The vendor webhook body is invalid.',
    status: input.code === 'cents_webhook_body_too_large' ? 413 : 400,
  });

export const makeCentsWebhookNormalizationBoundary =
  (): RequestHandler => (request, response, next) => {
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
    if (!normalized.ok) {
      next(normalizationError(normalized.error));
      return;
    }

    request.body = toCentsWebhookEventCommand(normalized.value);
    next();
  };

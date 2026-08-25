import {
  http,
  type CellOutcome,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { encodeBase64Bytes } from '@pressly/codec';
import {
  conflictError,
  externalServiceError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { IngestWebhookEventResult } from '../../../model/inbox.ts';
import type { ReceiveCentsWebhookFailure } from './types.ts';

const present = (
  outcome: CellOutcome<IngestWebhookEventResult, ReceiveCentsWebhookFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return { status: 202, body: { ok: true, data: outcome.value } };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
    ...(outcome.failure.code === 'cents_webhook_body_too_large'
      ? { status: 413 as const }
      : {}),
  };
  throw outcome.failure.kind === 'not_found'
    ? notFoundError(fields)
    : outcome.failure.kind === 'conflict'
      ? conflictError(fields)
      : validationError(fields);
};

export const receiveCentsWebhookHttpSurface = http.post<
  IngestWebhookEventResult,
  ReceiveCentsWebhookFailure
>({
  path: '/webhooks/cents',
  bodyLimit: '256kb',
  toSerializedInput: (request) => {
    if (!(request.body instanceof Uint8Array))
      throw externalServiceError({
        code: 'cents_webhook_raw_body_unavailable',
        message: 'Cents webhook raw body was unavailable.',
        safeMessage: 'Vendor webhook receipt is unavailable.',
        status: 503,
      });
    return { rawBodyBase64: encodeBase64Bytes(request.body) };
  },
  present,
}) satisfies HttpSurface<IngestWebhookEventResult, ReceiveCentsWebhookFailure>;

import {
  makeAppError,
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors';
import { apiFailure } from '@pressly/http';
import type { ErrorRequestHandler } from 'express';
import type { ApiRuntime } from '../runtime/runtime.ts';
import { observeApiError } from '../observability/api-observability.ts';

type ExpressParserError = Error &
  Readonly<{
    status?: number;
    type?: string;
  }>;

const normalizeParserError = (error: unknown): unknown => {
  const parserError = error as ExpressParserError;

  if (parserError?.type === 'entity.too.large')
    return makeAppError({
      kind: 'ValidationError',
      code: 'request_body_too_large',
      message: parserError.message,
      safeMessage: 'The request body is too large.',
      status: 413,
      cause: parserError,
    });

  if (parserError?.type === 'entity.parse.failed')
    return makeAppError({
      kind: 'ValidationError',
      code: 'malformed_json',
      message: parserError.message,
      safeMessage: 'The request body contains malformed JSON.',
      status: 400,
      cause: parserError,
    });

  return error;
};

const responseError = (
  appError: AppError,
  requestId: string | undefined,
): AppError => {
  const traceId = appError.traceId ?? requestId;

  if (appError.status < 500 && traceId === appError.traceId) return appError;

  return makeAppError({
    kind: appError.kind,
    code: appError.code,
    message: appError.message,
    safeMessage: appError.safeMessage,
    status: appError.status,
    ...(appError.status < 500 && appError.details !== undefined
      ? { details: appError.details }
      : {}),
    ...(appError.cause === undefined ? {} : { cause: appError.cause }),
    ...(traceId === undefined ? {} : { traceId }),
  });
};

export const makeErrorHandler = (runtime: ApiRuntime): ErrorRequestHandler => {
  return (err, req, res, next): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const appError = normalizeUnknownError(normalizeParserError(err));
    const requestId = res.locals['requestId'] as string | undefined;

    observeApiError(runtime, { appError, request: req, requestId });

    if (
      res.locals['webhookSource'] === 'cents' &&
      appError.status >= 400 &&
      appError.status < 500
    )
      runtime.observability.counters.increment('api.webhook_rejections', {
        source: 'cents',
        reason: appError.code,
        status: String(appError.status),
      });

    if (appError.code === 'invalid_cents_webhook_authentication')
      runtime.securityEvents.emit({
        name: 'vendor.webhook_authentication_failed',
        occurredAt: new Date().toISOString(),
        outcome: 'denied',
        ...(requestId === undefined ? {} : { requestId }),
        resourceType: 'http.route',
        resourceId: req.path,
        reason: appError.code,
      });

    if (
      appError.kind === 'ValidationError' ||
      appError.status === 413 ||
      appError.status === 415 ||
      appError.status === 422
    )
      runtime.securityEvents.emit({
        name: 'request.validation_rejected',
        occurredAt: new Date().toISOString(),
        outcome: 'denied',
        ...(requestId === undefined ? {} : { requestId }),
        resourceType: 'http.route',
        resourceId: req.path,
        reason: appError.code,
      });

    res
      .status(appError.status)
      .json(apiFailure(responseError(appError, requestId)));
  };
};

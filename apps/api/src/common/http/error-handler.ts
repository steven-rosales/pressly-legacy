import { makeAppError, normalizeUnknownError } from '@pressly/errors';
import { apiFailure } from '@pressly/http';
import type { ErrorRequestHandler } from 'express';
import type { ApiRuntime } from '../runtime/runtime.ts';
import type { LogValue } from '@pressly/logging';

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

export const makeErrorHandler = (runtime: ApiRuntime): ErrorRequestHandler => {
  return (err, _req, res, next): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const appError = normalizeUnknownError(normalizeParserError(err));
    const requestId = res.locals['requestId'] as string | undefined;

    runtime.logger.error(appError.message, {
      kind: appError.kind,
      code: appError.code,
      status: appError.status,
      details: appError.details as LogValue,
      requestId,
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
        resourceId: _req.path,
        reason: appError.code,
      });

    if (appError.status >= 500)
      runtime.securityEvents.emit({
        name: 'server.error',
        occurredAt: new Date().toISOString(),
        outcome: 'failed',
        ...(requestId === undefined ? {} : { requestId }),
        resourceType: 'http.route',
        resourceId: _req.path,
        reason: appError.code,
      });

    res.status(appError.status).json(apiFailure(appError));
  };
};

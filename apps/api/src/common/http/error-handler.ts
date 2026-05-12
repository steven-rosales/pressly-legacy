import { normalizeUnknownError } from '@pressly/errors';
import { apiFailure } from '@pressly/http';
import type { ErrorRequestHandler } from 'express';
import type { ApiRuntime } from '../runtime/runtime.ts';
import type { LogValue } from '@pressly/logging';

export const makeErrorHandler = (runtime: ApiRuntime): ErrorRequestHandler => {
  return (err, _req, res, next): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const appError = normalizeUnknownError(err);

    runtime.logger.error(appError.message, {
      kind: appError.kind,
      code: appError.code,
      status: appError.status,
      details: appError.details as LogValue,
    });

    res.status(appError.status).json(apiFailure(appError));
  };
};

import { validationError } from '@pressly/errors';
import type { RequestHandler } from 'express';

export const requireJsonContentType =
  (): RequestHandler =>
  (req, _res, next): void => {
    const isJson = Boolean(req.is(['application/json', 'application/*+json']));

    if (isJson) {
      next();
      return;
    }

    next(
      validationError({
        code: 'unsupported_media_type',
        message: `Expected a JSON content type for ${req.method} ${req.path}.`,
        safeMessage: 'This endpoint requires a JSON request body.',
        status: 415,
      }),
    );
  };

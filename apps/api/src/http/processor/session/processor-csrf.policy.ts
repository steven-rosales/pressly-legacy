import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { processorForbidden } from './processor-session.error.ts';
import type { ProcessorSessionOptions } from './processor-session.port.ts';

const csrfDomain = 'pressly.processor.csrf.v1\0';

export const deriveProcessorCsrfToken = (
  sessionToken: string,
  csrfSecret: string,
): string =>
  createHmac('sha256', csrfSecret)
    .update(csrfDomain, 'utf8')
    .update(sessionToken, 'utf8')
    .digest('base64url');

export const processorRequestNeedsCsrf = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

export const requireProcessorOrigin = (
  request: Request,
  options: ProcessorSessionOptions,
): void => {
  if (request.header('origin') === options.origin) return;

  throw processorForbidden({
    code: 'processor_origin_rejected',
    message: 'Processor request origin did not match the configured origin.',
    safeMessage: 'This processor request was rejected.',
  });
};

const equalToken = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

export const requireProcessorCsrf = (
  request: Request,
  sessionToken: string,
  options: ProcessorSessionOptions,
): void => {
  requireProcessorOrigin(request, options);
  const provided = request.header('x-csrf-token');
  const expected = deriveProcessorCsrfToken(sessionToken, options.csrfSecret);

  if (provided !== undefined && equalToken(provided, expected)) return;

  throw processorForbidden({
    code: 'processor_csrf_rejected',
    message: 'Processor request did not include a valid CSRF proof.',
    safeMessage: 'This processor request was rejected.',
  });
};

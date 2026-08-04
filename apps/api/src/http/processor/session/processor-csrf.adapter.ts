import { defineCookieCsrfProtection } from '@pressly/http/express';
import type { Request } from 'express';
import { processorForbidden } from './processor-session.error.ts';
import type { ProcessorSessionOptions } from './processor-session.port.ts';

const processorCsrf = defineCookieCsrfProtection({
  domain: 'pressly.processor.csrf.v1\0',
  makeOriginError: () =>
    processorForbidden({
      code: 'processor_origin_rejected',
      message: 'Processor request origin did not match the configured origin.',
      safeMessage: 'This processor request was rejected.',
    }),
  makeCsrfError: () =>
    processorForbidden({
      code: 'processor_csrf_rejected',
      message: 'Processor request did not include a valid CSRF proof.',
      safeMessage: 'This processor request was rejected.',
    }),
});

export const deriveProcessorCsrfToken = (
  sessionToken: string,
  csrfSecret: string,
): string => processorCsrf.deriveToken(sessionToken, csrfSecret);

export const processorRequestNeedsCsrf = (method: string): boolean =>
  processorCsrf.requestNeedsCsrf(method);

export const requireProcessorOrigin = (
  request: Request,
  options: ProcessorSessionOptions,
): void => {
  processorCsrf.requireOrigin(request, options);
};

export const requireProcessorCsrf = (
  request: Request,
  sessionToken: string,
  options: ProcessorSessionOptions,
): void => {
  processorCsrf.requireCsrf(request, sessionToken, options);
};

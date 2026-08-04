import { defineCookieCsrfProtection } from '@pressly/http/express';
import type { Request } from 'express';
import { controlForbidden } from './control-session.error.ts';
import type { ControlSessionOptions } from './control-session.port.ts';

const controlCsrfProtection = defineCookieCsrfProtection({
  domain: 'pressly.control.csrf.v1\0',
  makeOriginError: () =>
    controlForbidden({
      code: 'control_origin_rejected',
      message: 'Control request origin did not match the configured origin.',
    }),
  makeCsrfError: () =>
    controlForbidden({
      code: 'control_csrf_rejected',
      message: 'Control request did not include a valid CSRF proof.',
    }),
});

export const deriveControlCsrfToken = (
  sessionToken: string,
  csrfSecret: string,
): string => controlCsrfProtection.deriveToken(sessionToken, csrfSecret);

export const controlRequestNeedsCsrf = (method: string): boolean =>
  controlCsrfProtection.requestNeedsCsrf(method);

export const requireControlOrigin = (
  request: Request,
  options: ControlSessionOptions,
): void => {
  controlCsrfProtection.requireOrigin(request, options);
};

export const requireControlCsrf = (
  request: Request,
  sessionToken: string,
  options: ControlSessionOptions,
): void => {
  controlCsrfProtection.requireCsrf(request, sessionToken, options);
};

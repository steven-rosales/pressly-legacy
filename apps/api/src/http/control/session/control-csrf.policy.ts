import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { controlForbidden } from './control-session.error.ts';
import type { ControlSessionOptions } from './control-session.port.ts';

const csrfDomain = 'pressly.control.csrf.v1\0';

export const deriveControlCsrfToken = (
  sessionToken: string,
  csrfSecret: string,
): string =>
  createHmac('sha256', csrfSecret)
    .update(csrfDomain, 'utf8')
    .update(sessionToken, 'utf8')
    .digest('base64url');

export const controlRequestNeedsCsrf = (method: string): boolean =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

export const requireControlOrigin = (
  request: Request,
  options: ControlSessionOptions,
): void => {
  if (request.header('origin') === options.origin) return;

  throw controlForbidden({
    code: 'control_origin_rejected',
    message: 'Control request origin did not match the configured origin.',
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

export const requireControlCsrf = (
  request: Request,
  sessionToken: string,
  options: ControlSessionOptions,
): void => {
  requireControlOrigin(request, options);
  const provided = request.header('x-csrf-token');
  const expected = deriveControlCsrfToken(sessionToken, options.csrfSecret);

  if (provided !== undefined && equalToken(provided, expected)) return;

  throw controlForbidden({
    code: 'control_csrf_rejected',
    message: 'Control request did not include a valid CSRF proof.',
  });
};

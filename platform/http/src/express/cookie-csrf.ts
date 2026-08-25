import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export type CookieCsrfRuntimeOptions = Readonly<{
  origin: string;
  csrfSecret: string;
}>;

export type CookieCsrfProtectionDefinition = Readonly<{
  /** Domain separator. Changing it intentionally invalidates existing proofs. */
  domain: string;
  safeMethods?: readonly string[];
  tokenHeader?: string;
  makeOriginError: () => Error;
  makeCsrfError: () => Error;
}>;

export type CookieCsrfProtection = Readonly<{
  deriveToken: (sessionToken: string, csrfSecret: string) => string;
  requestNeedsCsrf: (method: string) => boolean;
  requireOrigin: (request: Request, options: CookieCsrfRuntimeOptions) => void;
  requireCsrf: (
    request: Request,
    sessionToken: string,
    options: CookieCsrfRuntimeOptions,
  ) => void;
}>;

const defaultSafeMethods = ['GET', 'HEAD', 'OPTIONS'] as const;

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

/**
 * Defines double-submit-style CSRF proof derived from a server-only secret and
 * the opaque session cookie. Application domains retain ownership of origins,
 * domain separators, secrets, and their throwable error vocabulary.
 */
export const defineCookieCsrfProtection = (
  definition: CookieCsrfProtectionDefinition,
): CookieCsrfProtection => {
  const safeMethods = Object.freeze(
    [...new Set(definition.safeMethods ?? defaultSafeMethods)].map((method) =>
      method.toUpperCase(),
    ),
  );
  const tokenHeader = definition.tokenHeader ?? 'x-csrf-token';

  const deriveToken = (sessionToken: string, csrfSecret: string): string =>
    createHmac('sha256', csrfSecret)
      .update(definition.domain, 'utf8')
      .update(sessionToken, 'utf8')
      .digest('base64url');

  const requestNeedsCsrf = (method: string): boolean =>
    !safeMethods.includes(method.toUpperCase());

  const requireOrigin = (
    request: Request,
    options: CookieCsrfRuntimeOptions,
  ): void => {
    if (request.header('origin') === options.origin) return;
    throw definition.makeOriginError();
  };

  const requireCsrf = (
    request: Request,
    sessionToken: string,
    options: CookieCsrfRuntimeOptions,
  ): void => {
    requireOrigin(request, options);
    const provided = request.header(tokenHeader);
    const expected = deriveToken(sessionToken, options.csrfSecret);

    if (provided !== undefined && constantTimeEqual(provided, expected)) return;
    throw definition.makeCsrfError();
  };

  return Object.freeze({
    deriveToken,
    requestNeedsCsrf,
    requireOrigin,
    requireCsrf,
  });
};

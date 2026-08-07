import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { defineCookieCsrfProtection } from '../src/express/cookie-csrf.js';

const request = (
  method: string,
  headers: Readonly<Record<string, string>> = {},
): Request =>
  ({
    method,
    header: (name: string) => headers[name.toLowerCase()],
  }) as Request;

const defineTestProtection = (domain = 'pressly.test.csrf.v1\0') =>
  defineCookieCsrfProtection({
    domain,
    makeOriginError: () =>
      Object.assign(new Error('Origin rejected.'), {
        code: 'origin_rejected',
      }),
    makeCsrfError: () =>
      Object.assign(new Error('CSRF rejected.'), {
        code: 'csrf_rejected',
      }),
  });

const options = {
  origin: 'https://app.test',
  csrfSecret: 'server-only-test-secret-at-least-32-bytes',
};

describe('defineCookieCsrfProtection', () => {
  it('derives deterministic, domain-separated proofs', () => {
    const first = defineTestProtection('pressly.first.csrf.v1\0');
    const second = defineTestProtection('pressly.second.csrf.v1\0');
    const sessionToken = 'opaque-session-token';

    expect(first.deriveToken(sessionToken, options.csrfSecret)).toBe(
      first.deriveToken(sessionToken, options.csrfSecret),
    );
    expect(first.deriveToken(sessionToken, options.csrfSecret)).not.toBe(
      second.deriveToken(sessionToken, options.csrfSecret),
    );
  });

  it.each(['GET', 'get', 'HEAD', 'OPTIONS'])(
    'treats %s as safe by default',
    (method) => {
      expect(defineTestProtection().requestNeedsCsrf(method)).toBe(false);
    },
  );

  it('requires CSRF for unsafe methods', () => {
    const protection = defineTestProtection();
    expect(protection.requestNeedsCsrf('POST')).toBe(true);
    expect(protection.requestNeedsCsrf('PATCH')).toBe(true);
    expect(protection.requestNeedsCsrf('DELETE')).toBe(true);
  });

  it('requires an exact configured origin', () => {
    const protection = defineTestProtection();

    expect(() =>
      protection.requireOrigin(
        request('POST', { origin: 'https://app.test/' }),
        options,
      ),
    ).toThrow(expect.objectContaining({ code: 'origin_rejected' }));
    expect(() =>
      protection.requireOrigin(
        request('POST', { origin: options.origin }),
        options,
      ),
    ).not.toThrow();
  });

  it('requires the exact derived proof after the origin check', () => {
    const protection = defineTestProtection();
    const sessionToken = 'opaque-session-token';
    const proof = protection.deriveToken(sessionToken, options.csrfSecret);

    expect(() =>
      protection.requireCsrf(
        request('POST', { origin: options.origin }),
        sessionToken,
        options,
      ),
    ).toThrow(expect.objectContaining({ code: 'csrf_rejected' }));
    expect(() =>
      protection.requireCsrf(
        request('POST', {
          origin: options.origin,
          'x-csrf-token': `${proof}x`,
        }),
        sessionToken,
        options,
      ),
    ).toThrow(expect.objectContaining({ code: 'csrf_rejected' }));
    expect(() =>
      protection.requireCsrf(
        request('POST', {
          origin: options.origin,
          'x-csrf-token': proof,
        }),
        sessionToken,
        options,
      ),
    ).not.toThrow();
  });

  it('allows an explicit safe-method and header profile', () => {
    const protection = defineCookieCsrfProtection({
      domain: 'pressly.custom.csrf.v1\0',
      safeMethods: ['GET', 'TRACE'],
      tokenHeader: 'x-custom-proof',
      makeOriginError: () => new Error('Origin rejected.'),
      makeCsrfError: () => new Error('CSRF rejected.'),
    });
    const sessionToken = 'opaque-session-token';
    const proof = protection.deriveToken(sessionToken, options.csrfSecret);

    expect(protection.requestNeedsCsrf('TRACE')).toBe(false);
    expect(() =>
      protection.requireCsrf(
        request('POST', {
          origin: options.origin,
          'x-custom-proof': proof,
        }),
        sessionToken,
        options,
      ),
    ).not.toThrow();
  });
});

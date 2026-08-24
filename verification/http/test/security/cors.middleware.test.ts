import { isAppError } from '@pressly/errors/app-error';
import type { CorsOptions } from 'cors';
import { describe, expect, it } from 'vitest';
import { makeCorsOptions } from '@pressly/http-host/runtime';

const isOriginAllowed = (
  options: CorsOptions,
  origin: string | undefined,
): Promise<boolean> => {
  const originPolicy = options.origin;

  if (typeof originPolicy !== 'function')
    throw new TypeError('Expected a dynamic CORS origin policy.');

  return new Promise((resolve, reject) => {
    originPolicy(origin, (error, allowed) => {
      if (error !== null) {
        reject(error);
        return;
      }

      resolve(allowed === true);
    });
  });
};

const expectCorsConfigError = (run: () => unknown): void => {
  try {
    run();
  } catch (error) {
    expect(isAppError(error)).toBe(true);
    if (!isAppError(error)) return;

    expect(error).toMatchObject({
      kind: 'ConfigError',
      code: 'invalid_cors_origin',
      status: 500,
    });
    return;
  }

  throw new Error('Expected CORS configuration to fail.');
};

describe('makeCorsOptions', () => {
  it('allows configured origins exactly and permits requests without Origin', async () => {
    const options = makeCorsOptions(
      'https://trypressly.com/, https://admin.trypressly.com',
      'production',
    );

    await expect(
      isOriginAllowed(options, 'https://trypressly.com'),
    ).resolves.toBe(true);
    await expect(
      isOriginAllowed(options, 'https://admin.trypressly.com'),
    ).resolves.toBe(true);
    await expect(
      isOriginAllowed(options, 'https://trypressly.com.attacker.example'),
    ).resolves.toBe(false);
    await expect(isOriginAllowed(options, undefined)).resolves.toBe(true);
  });

  it('allows local HTTP origins outside production', async () => {
    const options = makeCorsOptions('http://localhost:3000', 'development');

    await expect(
      isOriginAllowed(options, 'http://localhost:3000'),
    ).resolves.toBe(true);
  });

  it('uses only the methods and request headers needed by current clients', () => {
    const options = makeCorsOptions('https://trypressly.com', 'production');

    expect(options).toMatchObject({
      methods: 'GET,HEAD,POST,PUT,PATCH,OPTIONS',
      allowedHeaders:
        'Accept,Authorization,Content-Type,X-CSRF-Token,X-Pressly-Route,X-Pressly-Session-Id',
      maxAge: 600,
      optionsSuccessStatus: 204,
    });
    expect(options.credentials).toBeUndefined();
  });

  it('requires at least one configured origin in production', () => {
    expectCorsConfigError(() => makeCorsOptions('', 'production'));
  });

  it('requires HTTPS origins in production', () => {
    expectCorsConfigError(() =>
      makeCorsOptions('http://trypressly.com', 'production'),
    );
  });

  it.each([
    '*',
    'not-a-url',
    'ftp://trypressly.com',
    'https://user:password@trypressly.com',
    'https://trypressly.com/path',
    'https://trypressly.com?source=web',
    'https://trypressly.com#app',
  ])('rejects invalid origin configuration: %s', (origin) => {
    expectCorsConfigError(() => makeCorsOptions(origin, 'development'));
  });
});

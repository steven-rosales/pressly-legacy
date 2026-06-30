import { makeAppError } from '@pressly/errors';
import type { CorsOptions } from 'cors';

const allowedMethods = 'GET,HEAD,POST,OPTIONS';
const allowedHeaders = [
  'Accept',
  'Authorization',
  'Content-Type',
  'X-CSRF-Token',
  'X-Pressly-Route',
  'X-Pressly-Session-Id',
].join(',');

const invalidCorsConfiguration = (
  message: string,
  cause?: unknown,
): ReturnType<typeof makeAppError> =>
  makeAppError({
    kind: 'ConfigError',
    code: 'invalid_cors_origin',
    message,
    safeMessage: 'The API CORS policy is misconfigured.',
    status: 500,
    ...(cause === undefined ? {} : { cause }),
  });

const parseAllowedOrigin = (
  value: string,
  nodeEnv: string,
  position: number,
): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch (cause) {
    throw invalidCorsConfiguration(
      `CORS_ORIGIN contains an invalid URL at position ${position}.`,
      cause,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw invalidCorsConfiguration(
      `CORS_ORIGIN must use HTTP or HTTPS at position ${position}.`,
    );

  if (nodeEnv === 'production' && url.protocol !== 'https:')
    throw invalidCorsConfiguration(
      `CORS_ORIGIN must use HTTPS in production at position ${position}.`,
    );

  if (
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw invalidCorsConfiguration(
      `CORS_ORIGIN must contain origins without credentials, paths, queries, or fragments at position ${position}.`,
    );

  return url.origin;
};

const loadAllowedOrigins = (
  corsOrigin: string,
  nodeEnv: string,
): ReadonlySet<string> => {
  const values = corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (nodeEnv === 'production' && values.length === 0)
    throw invalidCorsConfiguration(
      'CORS_ORIGIN must contain at least one origin in production.',
    );

  return new Set(
    values.map((value, index) => parseAllowedOrigin(value, nodeEnv, index + 1)),
  );
};

export const makeCorsOptions = (
  corsOrigin: string,
  nodeEnv: string,
): CorsOptions => {
  const allowedOrigins = loadAllowedOrigins(corsOrigin, nodeEnv);

  return {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    methods: allowedMethods,
    allowedHeaders,
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
};

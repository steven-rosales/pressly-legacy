import { result, type Result } from '@pressly/kernel';
import { type AppError } from '@pressly/errors/app-error';
import {
  externalServiceError,
  validationError,
} from '@pressly/errors/factories';
import {
  appErrorFromApiFailure,
  decodeApiResponse,
  encodeJsonBody,
  responseTraceId,
} from '@pressly/http';
import type { ZodType } from 'zod';

export type ApiClientEnv = NodeJS.ProcessEnv;

export const readApiUrl = (env: ApiClientEnv): Result<URL, AppError> => {
  const raw = env['PRESSLY_API_URL']?.trim() || 'http://localhost:4000';

  try {
    return result.ok(new URL(raw));
  } catch (cause) {
    return result.err(
      validationError({
        code: 'invalid_api_url',
        message: `Invalid PRESSLY_API_URL: ${raw}.`,
        safeMessage: 'PRESSLY_API_URL must be a valid URL.',
        details: { value: raw },
        cause,
      }),
    );
  }
};

const invalidApiResponse = (input: {
  response: Response;
  url: URL;
  cause: unknown;
}): AppError => {
  const traceId = responseTraceId(input.response.headers);

  return externalServiceError({
    code: 'invalid_api_response',
    message: `API returned an invalid response for ${input.url.toString()}.`,
    safeMessage: 'Pressly API returned an invalid response.',
    status: 502,
    cause: input.cause,
    details: {
      status: input.response.status,
      url: input.url.toString(),
    },
    ...(traceId === undefined ? {} : { traceId }),
  });
};

export const requestApi = async <T>(input: {
  apiUrl: URL;
  path: string;
  method: 'GET' | 'POST';
  dataSchema: ZodType<T>;
  bearerToken?: string;
  body?: unknown;
}): Promise<Result<T, AppError>> => {
  const url = new URL(input.path, input.apiUrl);
  const encodedBody =
    input.body === undefined ? undefined : encodeJsonBody(input.body);
  if (encodedBody?.tag === 'rejected')
    return result.err(
      validationError({
        code: 'cli_request_body_not_serializable',
        message: 'The CLI request body cannot be encoded as JSON.',
        safeMessage: 'The request contains unsupported data.',
        details: { reason: encodedBody.reason },
        ...(encodedBody.cause === undefined
          ? {}
          : { cause: encodedBody.cause }),
      }),
    );

  let response: Response;

  try {
    response = await fetch(url, {
      method: input.method,
      headers: {
        accept: 'application/json',
        ...(encodedBody === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(input.bearerToken === undefined
          ? {}
          : { authorization: `Bearer ${input.bearerToken}` }),
      },
      ...(encodedBody?.tag === 'encoded' ? { body: encodedBody.body } : {}),
    });
  } catch (cause) {
    return result.err(
      externalServiceError({
        code: 'api_request_failed',
        message: `Could not reach API at ${url.toString()}.`,
        safeMessage: 'Could not reach the Pressly API.',
        status: 502,
        cause,
        details: { url: url.toString() },
      }),
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return result.err(invalidApiResponse({ response, url, cause }));
  }

  const decoded = decodeApiResponse(body, input.dataSchema);
  if (!decoded.success)
    return result.err(
      invalidApiResponse({ response, url, cause: decoded.error }),
    );

  if (!decoded.data.ok)
    return result.err(
      appErrorFromApiFailure({
        failure: decoded.data,
        responseStatus: response.status,
        headers: response.headers,
      }),
    );

  if (!response.ok) {
    const traceId = responseTraceId(response.headers);
    return result.err(
      externalServiceError({
        code: 'api_status_envelope_mismatch',
        message: `API returned HTTP ${response.status} with a success envelope for ${url.toString()}.`,
        safeMessage: 'Pressly API returned an invalid response.',
        status: 502,
        details: { status: response.status, url: url.toString() },
        ...(traceId === undefined ? {} : { traceId }),
      }),
    );
  }

  return result.ok(decoded.data.data);
};

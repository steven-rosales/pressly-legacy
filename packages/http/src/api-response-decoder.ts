import {
  authError,
  conflictError,
  externalServiceError,
  notFoundError,
  permissionError,
  rateLimitError,
  validationError,
  type AppErrorFactoryInput,
} from '@pressly/errors/factories';
import type { AppError, HttpStatusCode } from '@pressly/errors/app-error';
import { jsonValueSchema } from '@pressly/codec/zod';
import { z } from 'zod';
import type { ApiFailure } from './api-response.js';

export type HeaderLookup = Readonly<{
  get(name: string): string | null;
}>;

export const apiFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.string().min(1).max(200),
        message: z.string().min(1).max(1_000),
        traceId: z.string().min(1).max(200).optional(),
        details: jsonValueSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const apiSuccessSchema = <Data>(dataSchema: z.ZodType<Data>) =>
  z
    .object({
      ok: z.literal(true),
      data: dataSchema,
      meta: z.record(z.string(), jsonValueSchema).optional(),
    })
    .strict();

export const apiResponseSchema = <Data>(dataSchema: z.ZodType<Data>) =>
  z.discriminatedUnion('ok', [apiSuccessSchema(dataSchema), apiFailureSchema]);

export const decodeApiResponse = <Data>(
  value: unknown,
  dataSchema: z.ZodType<Data>,
) => apiResponseSchema(dataSchema).safeParse(value);

const nonEmptyHeader = (
  value: string | null | undefined,
): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

export const responseTraceId = (headers?: HeaderLookup): string | undefined =>
  nonEmptyHeader(headers?.get('x-request-id'));

export const apiFailureTraceId = (
  failure: ApiFailure,
  headers?: HeaderLookup,
): string | undefined =>
  nonEmptyHeader(failure.error.traceId) ?? responseTraceId(headers);

export const httpStatusCodeFromResponse = (status: number): HttpStatusCode => {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 408:
    case 409:
    case 413:
    case 415:
    case 422:
    case 429:
    case 500:
    case 502:
    case 503:
    case 504:
      return status;
    default:
      return 502;
  }
};

export type HttpAppErrorKind =
  | 'ValidationError'
  | 'AuthError'
  | 'PermissionError'
  | 'NotFoundError'
  | 'ConflictError'
  | 'RateLimitError'
  | 'ExternalServiceError';

export const appErrorKindForHttpStatus = (
  status: HttpStatusCode,
): HttpAppErrorKind => {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return 'ValidationError';
    case 401:
      return 'AuthError';
    case 403:
      return 'PermissionError';
    case 404:
      return 'NotFoundError';
    case 409:
      return 'ConflictError';
    case 429:
      return 'RateLimitError';
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return 'ExternalServiceError';
  }
};

export type AppErrorFromApiFailureInput = Readonly<{
  failure: ApiFailure;
  responseStatus: number;
  headers?: HeaderLookup;
  cause?: unknown;
}>;

export const appErrorFromApiFailure = (
  input: AppErrorFromApiFailureInput,
): AppError => {
  const status = httpStatusCodeFromResponse(input.responseStatus);
  const traceId = apiFailureTraceId(input.failure, input.headers);
  const fields: AppErrorFactoryInput = {
    code: input.failure.error.code,
    message: input.failure.error.message,
    safeMessage: input.failure.error.message,
    ...(input.failure.error.details === undefined
      ? {}
      : { publicDetails: input.failure.error.details }),
    ...(input.cause === undefined ? {} : { cause: input.cause }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(status === 502 && input.responseStatus !== 502
      ? { details: { receivedStatus: input.responseStatus } }
      : {}),
  };

  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return validationError({ ...fields, status });
    case 401:
      return authError(fields);
    case 403:
      return permissionError(fields);
    case 404:
      return notFoundError(fields);
    case 409:
      return conflictError(fields);
    case 429:
      return rateLimitError(fields);
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return externalServiceError({ ...fields, status });
  }
};

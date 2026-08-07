import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  apiFailureTraceId,
  appErrorFromApiFailure,
  appErrorKindForHttpStatus,
  decodeApiResponse,
  httpStatusCodeFromResponse,
  responseTraceId,
} from '../src/api-response-decoder.js';
import type { ApiFailure } from '../src/api-response.js';

const failure = (overrides: Partial<ApiFailure['error']> = {}): ApiFailure => ({
  ok: false,
  error: {
    code: 'request_failed',
    message: 'The request could not be completed.',
    ...overrides,
  },
});

describe('API response decoder', () => {
  it('reads a non-empty response correlation identifier', () => {
    expect(
      responseTraceId(new Headers({ 'x-request-id': ' request_123 ' })),
    ).toBe('request_123');
    expect(responseTraceId(new Headers({ 'x-request-id': '   ' }))).toBe(
      undefined,
    );
  });

  const dataSchema = z.object({ status: z.literal('ok') }).strict();

  it('decodes endpoint data and optional success metadata', () => {
    const decoded = decodeApiResponse(
      {
        ok: true,
        data: { status: 'ok' },
        meta: { cursor: 'next_page' },
      },
      dataSchema,
    );

    expect(decoded).toEqual({
      success: true,
      data: {
        ok: true,
        data: { status: 'ok' },
        meta: { cursor: 'next_page' },
      },
    });
  });

  it('requires the failure code and message', () => {
    expect(
      decodeApiResponse(
        { ok: false, error: { message: 'Missing code.' } },
        dataSchema,
      ).success,
    ).toBe(false);
    expect(
      decodeApiResponse(
        { ok: false, error: { code: 'missing_message' } },
        dataSchema,
      ).success,
    ).toBe(false);
  });

  it.each([null, [], {}, { ok: true, data: null }, { ok: 'true' }])(
    'rejects malformed envelope %#',
    (value) => {
      expect(decodeApiResponse(value, dataSchema).success).toBe(false);
    },
  );

  it('decodes bounded failure fields and public details', () => {
    const value = failure({
      traceId: 'body_trace',
      details: { field: 'email' },
    });

    expect(decodeApiResponse(value, dataSchema)).toEqual({
      success: true,
      data: value,
    });
  });

  it('rejects non-JSON metadata at the transport boundary', () => {
    expect(
      decodeApiResponse(
        {
          ok: false,
          error: {
            code: 'request_failed',
            message: 'Request failed.',
            details: { generatedAt: new Date() },
          },
        },
        dataSchema,
      ).success,
    ).toBe(false);
    expect(
      decodeApiResponse(
        {
          ok: true,
          data: { status: 'ok' },
          meta: { cursor: undefined },
        },
        dataSchema,
      ).success,
    ).toBe(false);
  });
});

describe('API failure correlation', () => {
  const headers = (requestId: string | null) => ({
    get: (name: string) =>
      name.toLowerCase() === 'x-request-id' ? requestId : null,
  });

  it('prefers a body trace ID over the response request ID', () => {
    expect(
      apiFailureTraceId(
        failure({ traceId: 'body_trace' }),
        headers('header_trace'),
      ),
    ).toBe('body_trace');
  });

  it('falls back to a non-empty response request ID', () => {
    expect(apiFailureTraceId(failure(), headers(' header_trace '))).toBe(
      'header_trace',
    );
    expect(apiFailureTraceId(failure(), headers('   '))).toBeUndefined();
  });
});

describe('HTTP status error policy', () => {
  it.each([
    [400, 'ValidationError'],
    [401, 'AuthError'],
    [403, 'PermissionError'],
    [404, 'NotFoundError'],
    [408, 'ExternalServiceError'],
    [409, 'ConflictError'],
    [413, 'ValidationError'],
    [415, 'ValidationError'],
    [422, 'ValidationError'],
    [429, 'RateLimitError'],
    [500, 'ExternalServiceError'],
    [502, 'ExternalServiceError'],
    [503, 'ExternalServiceError'],
    [504, 'ExternalServiceError'],
  ] as const)('maps HTTP %s to %s', (status, kind) => {
    expect(httpStatusCodeFromResponse(status)).toBe(status);
    expect(appErrorKindForHttpStatus(status)).toBe(kind);
    expect(
      appErrorFromApiFailure({
        failure: failure({ details: { retryable: true } }),
        responseStatus: status,
      }),
    ).toMatchObject({
      tag: 'AppError',
      kind,
      status,
      code: 'request_failed',
      publicDetails: { retryable: true },
    });
  });

  it('treats unsupported statuses as an invalid upstream response', () => {
    const error = appErrorFromApiFailure({
      failure: failure(),
      responseStatus: 418,
    });

    expect(error).toMatchObject({
      kind: 'ExternalServiceError',
      status: 502,
      details: { receivedStatus: 418 },
    });
  });

  it('preserves correlation and causes without making them public details', () => {
    const cause = new Error('fetch failed');
    const error = appErrorFromApiFailure({
      failure: failure(),
      responseStatus: 503,
      headers: { get: () => 'request_123' },
      cause,
    });

    expect(error.traceId).toBe('request_123');
    expect(error.cause).toBe(cause);
    expect(error.details).toBeUndefined();
    expect(error.publicDetails).toBeUndefined();
  });
});

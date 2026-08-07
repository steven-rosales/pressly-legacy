import { result } from '@pressly/kernel';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApi } from '../../src/shell/api-client.ts';

const originalFetch = globalThis.fetch;
const responseSchema = z.object({ value: z.string() }).strict();

const request = () =>
  requestApi({
    apiUrl: new URL('https://api.pressly.test'),
    path: '/example',
    method: 'GET',
    dataSchema: responseSchema,
  });

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('CLI API request boundary', () => {
  it('decodes failures with the shared status policy and request-ID fallback', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'upstream_unavailable',
            message: 'The service is temporarily unavailable.',
            details: { retryAfterSeconds: 30 },
          },
        }),
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'request-from-api',
          },
        },
      );

    const response = await request();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error).toMatchObject({
      kind: 'ExternalServiceError',
      code: 'upstream_unavailable',
      status: 503,
      traceId: 'request-from-api',
      publicDetails: { retryAfterSeconds: 30 },
    });
    expect(response.error.details).toBeUndefined();
  });

  it('retains malformed-envelope diagnostics privately', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'malformed-response-request',
        },
      });

    const response = await request();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error).toMatchObject({
      kind: 'ExternalServiceError',
      code: 'invalid_api_response',
      status: 502,
      traceId: 'malformed-response-request',
      details: {
        status: 503,
        url: 'https://api.pressly.test/example',
      },
    });
    expect(response.error.cause).toBeInstanceOf(z.ZodError);
    expect(response.error.publicDetails).toBeUndefined();
  });

  it('retains invalid-JSON parse failures as the private cause', async () => {
    globalThis.fetch = async () =>
      new Response('{not-json', {
        status: 502,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'invalid-json-request',
        },
      });

    const response = await request();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error).toMatchObject({
      kind: 'ExternalServiceError',
      code: 'invalid_api_response',
      status: 502,
      traceId: 'invalid-json-request',
      details: {
        status: 502,
        url: 'https://api.pressly.test/example',
      },
    });
    expect(response.error.cause).toBeInstanceOf(SyntaxError);
    expect(response.error.publicDetails).toBeUndefined();
  });

  it('validates successful response data with the endpoint schema', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, data: { value: 42 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const response = await request();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error.code).toBe('invalid_api_response');
    expect(response.error.cause).toBeInstanceOf(z.ZodError);
  });

  it('rejects success envelopes carried by unsuccessful HTTP statuses', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, data: { value: 'wrong' } }), {
        status: 503,
        headers: { 'x-request-id': 'mismatched-status-request' },
      });

    const response = await request();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error).toMatchObject({
      kind: 'ExternalServiceError',
      code: 'api_status_envelope_mismatch',
      status: 502,
      traceId: 'mismatched-status-request',
      details: {
        status: 503,
        url: 'https://api.pressly.test/example',
      },
    });
  });

  it('classifies local body encoding failures before transport', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();

    const response = await requestApi({
      apiUrl: new URL('https://api.pressly.test'),
      path: '/example',
      method: 'POST',
      dataSchema: responseSchema,
      body: { value: 1n },
    });

    expect(result.isErr(response) && response.error).toMatchObject({
      kind: 'ValidationError',
      code: 'cli_request_body_not_serializable',
      status: 400,
      cause: expect.any(TypeError),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/**
 * @vitest-environment node
 */

import { z } from 'zod';
import * as result from '@pressly/cells/result';
import { makeFetchRequestClient } from '@/transport/fetch-request-client';

const makeClient = () =>
  makeFetchRequestClient({
    baseUrl: 'https://api.example.com',
    fetch: globalThis.fetch,
    getContext: () => ({
      route: '/pricing',
      sessionId: 'session_123',
      distinctId: 'distinct_123',
    }),
  });

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  });

describe('makeFetchRequestClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('returns ok(data) for ApiSuccess', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ ok: true, data: { status: 'alive' } }),
    );

    const result = await makeClient().send({
      method: 'GET',
      path: '/health/live',
      response: z.object({
        status: z.string(),
      }),
    });

    expect(result).toEqual({
      tag: 'ok',
      value: {
        status: 'alive',
      },
    });
  });

  it('accepts canonical success metadata', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: { status: 'alive' },
        meta: { page: 1 },
      }),
    );

    await expect(
      makeClient().send({
        method: 'GET',
        path: '/health/live',
        response: z.object({ status: z.string() }),
      }),
    ).resolves.toEqual({ tag: 'ok', value: { status: 'alive' } });
  });

  it('returns err(AppError) for ApiFailure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error: { code: 'route_not_found', message: 'Route not found.' },
        },
        { status: 404 },
      ),
    );

    const actual = await makeClient().send({
      method: 'GET',
      path: '/missing',
      response: z.object({
        status: z.string(),
      }),
    });

    expect(result.isErr(actual)).toBe(true);

    if (result.isErr(actual))
      expect(actual.error).toMatchObject({
        tag: 'AppError',
        code: 'route_not_found',
        safeMessage: 'Route not found.',
        status: 404,
      });
  });

  it('returns invalid_api_response when response contract does not match', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: {
          wrong: true,
        },
      }),
    );

    const actual = await makeClient().send({
      method: 'GET',
      path: '/health/live',
      response: z.object({
        status: z.string(),
      }),
    });

    expect(result.isErr(actual)).toBe(true);

    if (result.isErr(actual)) {
      expect(actual.error.code).toBe('invalid_api_response');
    }
  });

  it('rejects malformed failure envelopes', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        { ok: false, error: {} },
        {
          status: 503,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'malformed_request_123',
          },
        },
      ),
    );

    const actual = await makeClient().send({
      method: 'GET',
      path: '/health/live',
      response: z.object({ status: z.string() }),
    });

    expect(result.isErr(actual) && actual.error).toMatchObject({
      code: 'invalid_api_response',
      traceId: 'malformed_request_123',
    });
  });

  it('maps supported status codes and falls back to the response request ID', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error: { code: 'payload_too_large', message: 'Payload too large.' },
        },
        {
          status: 413,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'request_123',
          },
        },
      ),
    );

    const actual = await makeClient().send({
      method: 'POST',
      path: '/upload',
      response: z.object({ status: z.string() }),
    });

    expect(result.isErr(actual) && actual.error).toMatchObject({
      kind: 'ValidationError',
      status: 413,
      traceId: 'request_123',
    });
  });

  it('adds context headers', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: {
          status: 'alive',
        },
      }),
    );

    await makeClient().send({
      method: 'GET',
      path: '/health/live',
      response: z.object({
        status: z.string(),
      }),
    });

    const call = vi.mocked(global.fetch).mock.calls[0];
    const init = call?.[1];

    expect(init?.headers).toEqual(
      expect.objectContaining({
        get: expect.any(Function),
      }),
    );

    const headers = init?.headers as Headers;

    expect(headers.get('x-pressly-route')).toBe('/pricing');
    expect(headers.get('x-pressly-session-id')).toBe('session_123');
  });

  it('classifies local body encoding failures before transport', async () => {
    const actual = await makeClient().send({
      method: 'POST',
      path: '/example',
      body: { value: 1n },
      response: z.object({ status: z.string() }),
    });

    expect(result.isErr(actual) && actual.error).toMatchObject({
      kind: 'ValidationError',
      code: 'request_body_not_serializable',
      status: 400,
      cause: expect.any(TypeError),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves the native TimeoutError abort reason while classifying the request', async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(global.fetch).mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
      );

      const pending = makeClient().send({
        method: 'GET',
        path: '/slow',
        response: z.object({ status: z.string() }),
        timeoutMs: 25,
      });

      await vi.advanceTimersByTimeAsync(25);

      await expect(pending).resolves.toMatchObject({
        tag: 'err',
        error: {
          code: 'request_timed_out',
          status: 504,
        },
      });

      const signal = vi.mocked(global.fetch).mock.calls[0]?.[1]
        ?.signal as AbortSignal;
      expect(signal.reason).toBeInstanceOf(DOMException);
      expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
    } finally {
      vi.useRealTimers();
    }
  });
});

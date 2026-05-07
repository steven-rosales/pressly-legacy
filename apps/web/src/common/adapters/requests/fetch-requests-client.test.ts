/**
 * @vitest-environment node
 */

import { z } from 'zod';
import { makeFetchRequestClient } from './fetch-request-client';

const makeClient = () =>
  makeFetchRequestClient({
    baseUrl: 'https://api.example.com',
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
      ok: true,
      value: {
        status: 'alive',
      },
    });
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

    const result = await makeClient().send({
      method: 'GET',
      path: '/missing',
      response: z.object({
        status: z.string(),
      }),
    });

    expect(result.ok).toBe(false);

    if (!result.ok)
      expect(result.error).toMatchObject({
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

    const result = await makeClient().send({
      method: 'GET',
      path: '/health/live',
      response: z.object({
        status: z.string(),
      }),
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe('invalid_api_response');
    }
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
});

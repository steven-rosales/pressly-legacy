import type { BrowserResponseCodec } from '@pressly/experience-processor/browser';
import { describe, expect, it, vi } from 'vitest';
import { makeProcessorBrowserRequestTransport as makeBrowserRequestAdapter } from '@pressly/topology/browser';
import { makeFetchRequestAdapter } from '../../../src/runtime/fetch-request.adapter.ts';

const codec = <Output>(
  decode: BrowserResponseCodec<Output>['decode'],
): BrowserResponseCodec<Output> => ({ decode });

describe('Processor browser request adapter', () => {
  it('preserves envelope, CSRF, body, signal, and serialized wire behavior', async () => {
    const serialized = { expiresAt: '2026-08-22T20:00:00.000Z' };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, data: serialized }), {
          status: 200,
        }),
    );
    const request = makeBrowserRequestAdapter(
      makeFetchRequestAdapter({
        baseUrl: '/api',
        readCsrfToken: () => 'csrf-proof',
        fetch: fetcher,
      }),
    );
    const signal = new AbortController().signal;

    const result = await request(
      {
        method: 'POST',
        path: '/processor/test',
        body: { value: 1 },
        signal,
      },
      codec((value) => ({ kind: 'valid', value: value as typeof serialized })),
    );

    expect(result).toEqual(serialized);
    expect(result.expiresAt).toBe(serialized.expiresAt);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/processor/test',
      expect.objectContaining({
        method: 'POST',
        body: '{"value":1}',
        signal,
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-proof' }),
      }),
    );
  });

  it('maps boundary rejection through the existing invalid-response failure', async () => {
    const request = makeBrowserRequestAdapter(
      makeFetchRequestAdapter({
        baseUrl: '/api',
        readCsrfToken: () => null,
        fetch: vi.fn(
          async () =>
            new Response(JSON.stringify({ ok: true, data: { leaked: true } }), {
              status: 200,
            }),
        ),
      }),
    );

    await expect(
      request(
        { method: 'GET', path: '/processor/test' },
        codec(() => ({
          kind: 'invalid',
          issues: [{ path: ['leaked'], message: 'Unknown field.' }],
        })),
      ),
    ).rejects.toMatchObject({ requestKind: 'invalid_response' });
  });

  it('preserves caller cancellation without wrapping or observation', async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException('Cancelled', 'AbortError');
    const observed = vi.fn();
    const request = makeBrowserRequestAdapter(
      makeFetchRequestAdapter({
        baseUrl: '/api',
        readCsrfToken: () => null,
        onFailure: observed,
        fetch: vi.fn().mockRejectedValue(aborted),
      }),
    );

    await expect(
      request(
        {
          method: 'GET',
          path: '/processor/test',
          signal: controller.signal,
        },
        codec((value) => ({ kind: 'valid', value })),
      ),
    ).rejects.toBe(aborted);
    expect(observed).not.toHaveBeenCalled();
  });
});

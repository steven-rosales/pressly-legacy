import {
  makeControlBrowserRequestTransport,
  type BrowserResponseCodec,
} from '@pressly/experience-control/browser';
import { describe, expect, it, vi } from 'vitest';
import { isControlRequestError } from '@pressly/experience-control/browser';
import { makeControlHttpClient } from '../../src/runtime/control-http-client.ts';

const codec = <Output>(
  decode: BrowserResponseCodec<Output>['decode'],
): BrowserResponseCodec<Output> => ({ decode });

describe('Control browser request transport', () => {
  it('preserves the existing envelope, CSRF, body, and wire-value behavior', async () => {
    const serialized = {
      expiresAt: '2026-08-22T20:00:00.000Z',
    };
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ok: true, data: serialized }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const client = makeControlHttpClient({
      fetchImplementation,
      apiBaseUrl: '/api',
    });
    client.acceptCsrfToken('csrf-proof');
    const request = makeControlBrowserRequestTransport(client);

    const result = await request(
      {
        method: 'POST',
        path: '/control/test',
        body: { value: 1 },
        csrf: true,
      },
      codec((value) => ({ kind: 'valid', value: value as typeof serialized })),
    );

    expect(result).toEqual(serialized);
    expect(result.expiresAt).toBe(serialized.expiresAt);
    const [, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(init).toMatchObject({ method: 'POST', body: '{"value":1}' });
    expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-proof');
  });

  it('maps boundary codec rejection through the existing unreadable-response error', async () => {
    const client = makeControlHttpClient({
      fetchImplementation: vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, data: { leaked: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
      apiBaseUrl: '/api',
    });
    const request = makeControlBrowserRequestTransport(client);

    await expect(
      request(
        { method: 'GET', path: '/control/test' },
        codec(() => ({
          kind: 'invalid',
          issues: [{ path: ['leaked'], message: 'Unknown field.' }],
        })),
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isControlRequestError(error) &&
        error.controlKind === 'unreadable_response',
    );
  });
});
